/**
 * Database Backup Script for Titan Execution Service
 * 
 * Creates compressed backups of the SQLite database and optionally
 * uploads to S3 for off-server storage.
 * 
 * Requirements: 11.1-11.4
 * 
 * Property 32: Backup File Compression
 * For any created backup, file should be compressed with gzip and have timestamp in filename
 * 
 * Usage:
 *   node scripts/backup-database.js
 * 
 * Environment Variables:
 *   DATABASE_PATH - Path to database file (default: ./titan_execution.db)
 *   BACKUP_DIR - Backup directory (default: ./backups)
 *   AWS_S3_BUCKET - S3 bucket for off-server storage (optional)
 *   AWS_REGION - AWS region (default: us-east-1)
 *   BACKUP_RETENTION_DAYS - Days to keep backups (default: 30)
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../titan_execution.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../backups');
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '30');

/**
 * Main backup function
 */
async function backupDatabase() {
  console.log('\n🔄 Starting database backup...');
  console.log(`   Database: ${DATABASE_PATH}`);
  console.log(`   Backup directory: ${BACKUP_DIR}`);
  
  try {
    // Check if database exists
    if (!fs.existsSync(DATABASE_PATH)) {
      throw new Error(`Database file not found: ${DATABASE_PATH}`);
    }
    
    // Create backup directory if it doesn't exist
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      console.log(`✅ Created backup directory: ${BACKUP_DIR}`);
    }
    
    // Generate timestamp for backup filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.db`);
    const compressedFile = `${backupFile}.gz`;
    
    // Step 1: Copy database file
    console.log('\n📋 Copying database file...');
    fs.copyFileSync(DATABASE_PATH, backupFile);
    console.log(`✅ Database copied to ${backupFile}`);
    
    // Get file size
    const stats = fs.statSync(backupFile);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`   Size: ${fileSizeMB} MB`);
    
    // Step 2: Compress with gzip
    console.log('\n🗜️  Compressing backup...');
    await execAsync(`gzip ${backupFile}`);
    console.log(`✅ Backup compressed to ${compressedFile}`);
    
    // Get compressed file size
    const compressedStats = fs.statSync(compressedFile);
    const compressedSizeMB = (compressedStats.size / 1024 / 1024).toFixed(2);
    const compressionRatio = ((1 - compressedStats.size / stats.size) * 100).toFixed(1);
    console.log(`   Compressed size: ${compressedSizeMB} MB (${compressionRatio}% reduction)`);
    
    // Step 3: Upload to S3 (if configured)
    if (AWS_S3_BUCKET) {
      console.log('\n☁️  Uploading to S3...');
      await uploadToS3(compressedFile, AWS_S3_BUCKET, AWS_REGION);
      console.log(`✅ Backup uploaded to S3: s3://${AWS_S3_BUCKET}/titan-backups/${path.basename(compressedFile)}`);
    } else {
      console.log('\n⚠️  S3 upload skipped (AWS_S3_BUCKET not configured)');
    }
    
    // Step 4: Clean up old backups
    console.log('\n🗑️  Cleaning up old backups...');
    const deletedCount = await cleanupOldBackups(BACKUP_DIR, RETENTION_DAYS);
    console.log(`✅ Deleted ${deletedCount} old backup(s) (retention: ${RETENTION_DAYS} days)`);
    
    // Step 5: Verify backup integrity
    console.log('\n🔍 Verifying backup integrity...');
    const isValid = await verifyBackup(compressedFile);
    if (isValid) {
      console.log('✅ Backup integrity verified');
    } else {
      throw new Error('Backup integrity check failed');
    }
    
    console.log('\n✅ Backup completed successfully');
    console.log(`   Backup file: ${compressedFile}`);
    console.log(`   Size: ${compressedSizeMB} MB`);
    
    return {
      success: true,
      backupFile: compressedFile,
      size: compressedStats.size,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`\n❌ Backup failed: ${error.message}`);
    throw error;
  }
}

/**
 * Upload backup to S3
 * @param {string} filePath - Path to backup file
 * @param {string} bucket - S3 bucket name
 * @param {string} region - AWS region
 */
async function uploadToS3(filePath, bucket, region) {
  try {
    const s3 = new S3Client({ region });
    
    const fileContent = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `titan-backups/${fileName}`,
      Body: fileContent,
      ContentType: 'application/gzip',
      ServerSideEncryption: 'AES256',
      Metadata: {
        'backup-timestamp': new Date().toISOString(),
        'database-path': DATABASE_PATH
      }
    }));
    
    return true;
  } catch (error) {
    console.error(`Failed to upload to S3: ${error.message}`);
    throw error;
  }
}

/**
 * Clean up old backups
 * @param {string} backupDir - Backup directory
 * @param {number} retentionDays - Days to keep backups
 * @returns {number} Number of deleted backups
 */
async function cleanupOldBackups(backupDir, retentionDays) {
  const files = fs.readdirSync(backupDir);
  const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
  let deletedCount = 0;
  
  for (const file of files) {
    if (!file.startsWith('backup-') || !file.endsWith('.db.gz')) {
      continue;
    }
    
    const filePath = path.join(backupDir, file);
    const stats = fs.statSync(filePath);
    
    if (stats.mtimeMs < cutoffTime) {
      fs.unlinkSync(filePath);
      console.log(`   Deleted: ${file}`);
      deletedCount++;
    }
  }
  
  return deletedCount;
}

/**
 * Verify backup integrity
 * @param {string} compressedFile - Path to compressed backup
 * @returns {boolean} True if backup is valid
 */
async function verifyBackup(compressedFile) {
  try {
    // Test gzip integrity
    await execAsync(`gzip -t ${compressedFile}`);
    
    // Decompress to temp file and verify SQLite integrity
    const tempFile = `${compressedFile}.temp`;
    await execAsync(`gunzip -c ${compressedFile} > ${tempFile}`);
    
    // Check if it's a valid SQLite database
    const { stdout } = await execAsync(`file ${tempFile}`);
    const isValid = stdout.includes('SQLite');
    
    // Clean up temp file
    fs.unlinkSync(tempFile);
    
    return isValid;
  } catch (error) {
    console.error(`Backup verification failed: ${error.message}`);
    return false;
  }
}

/**
 * List all backups
 * @returns {Array} List of backup files with metadata
 */
export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) {
    return [];
  }
  
  const files = fs.readdirSync(BACKUP_DIR);
  const backups = [];
  
  for (const file of files) {
    if (!file.startsWith('backup-') || !file.endsWith('.db.gz')) {
      continue;
    }
    
    const filePath = path.join(BACKUP_DIR, file);
    const stats = fs.statSync(filePath);
    
    backups.push({
      filename: file,
      path: filePath,
      size: stats.size,
      created: stats.mtime,
      age_days: Math.floor((Date.now() - stats.mtimeMs) / (24 * 60 * 60 * 1000))
    });
  }
  
  // Sort by creation time (newest first)
  backups.sort((a, b) => b.created - a.created);
  
  return backups;
}

/**
 * Get latest backup
 * @returns {Object|null} Latest backup metadata
 */
export function getLatestBackup() {
  const backups = listBackups();
  return backups.length > 0 ? backups[0] : null;
}

// Run backup if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  backupDatabase()
    .then(() => {
      console.log('\n✅ Backup script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error(`\n❌ Backup script failed: ${error.message}`);
      process.exit(1);
    });
}

export { backupDatabase };
