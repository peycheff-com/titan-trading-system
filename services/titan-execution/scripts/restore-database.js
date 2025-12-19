/**
 * Database Restore Script for Titan Execution Service
 * 
 * Restores database from compressed backup file.
 * Can restore from local backup or download from S3.
 * 
 * Requirements: 11.5-11.7
 * 
 * Property 33: Backup Restoration Integrity
 * For any backup file, restoring should produce database with verified data integrity
 * 
 * Usage:
 *   node scripts/restore-database.js [backup-file]
 *   node scripts/restore-database.js --latest
 *   node scripts/restore-database.js --from-s3
 * 
 * Environment Variables:
 *   DATABASE_PATH - Path to database file (default: ./titan_execution.db)
 *   BACKUP_DIR - Backup directory (default: ./backups)
 *   AWS_S3_BUCKET - S3 bucket for off-server storage (optional)
 *   AWS_REGION - AWS region (default: us-east-1)
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { fileURLToPath } from 'url';
import { listBackups, getLatestBackup } from './backup-database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../titan_execution.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../backups');
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

/**
 * Main restore function
 * @param {string} backupFile - Path to backup file (optional)
 * @param {Object} options - Restore options
 */
async function restoreDatabase(backupFile, options = {}) {
  console.log('\n🔄 Starting database restore...');
  
  try {
    let backupPath;
    
    // Determine backup file to restore
    if (options.fromS3) {
      console.log('📥 Downloading latest backup from S3...');
      backupPath = await downloadLatestFromS3();
    } else if (options.latest) {
      console.log('📂 Using latest local backup...');
      const latest = getLatestBackup();
      if (!latest) {
        throw new Error('No local backups found');
      }
      backupPath = latest.path;
      console.log(`   Found: ${latest.filename}`);
      console.log(`   Created: ${latest.created.toISOString()}`);
      console.log(`   Size: ${(latest.size / 1024 / 1024).toFixed(2)} MB`);
    } else if (backupFile) {
      backupPath = backupFile;
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }
    } else {
      throw new Error('No backup file specified. Use --latest or provide a backup file path.');
    }
    
    console.log(`\n📋 Backup file: ${backupPath}`);
    
    // Step 1: Verify backup integrity
    console.log('\n🔍 Verifying backup integrity...');
    const isValid = await verifyBackup(backupPath);
    if (!isValid) {
      throw new Error('Backup integrity check failed');
    }
    console.log('✅ Backup integrity verified');
    
    // Step 2: Create backup of current database (if exists)
    if (fs.existsSync(DATABASE_PATH)) {
      const currentBackup = `${DATABASE_PATH}.before-restore-${Date.now()}`;
      console.log('\n💾 Backing up current database...');
      fs.copyFileSync(DATABASE_PATH, currentBackup);
      console.log(`✅ Current database backed up to ${currentBackup}`);
    }
    
    // Step 3: Decompress backup
    console.log('\n📦 Decompressing backup...');
    const tempFile = `${DATABASE_PATH}.temp`;
    await execAsync(`gunzip -c ${backupPath} > ${tempFile}`);
    console.log('✅ Backup decompressed');
    
    // Step 4: Verify decompressed database
    console.log('\n🔍 Verifying decompressed database...');
    const dbValid = await verifyDatabase(tempFile);
    if (!dbValid) {
      fs.unlinkSync(tempFile);
      throw new Error('Decompressed database is invalid');
    }
    console.log('✅ Database structure verified');
    
    // Step 5: Replace current database
    console.log('\n🔄 Replacing current database...');
    if (fs.existsSync(DATABASE_PATH)) {
      fs.unlinkSync(DATABASE_PATH);
    }
    fs.renameSync(tempFile, DATABASE_PATH);
    console.log('✅ Database restored');
    
    // Step 6: Verify restored database
    console.log('\n🔍 Verifying restored database...');
    const finalValid = await verifyDatabase(DATABASE_PATH);
    if (!finalValid) {
      throw new Error('Restored database verification failed');
    }
    
    // Get database statistics
    const stats = await getDatabaseStats(DATABASE_PATH);
    console.log('\n📊 Database Statistics:');
    console.log(`   Positions: ${stats.positions}`);
    console.log(`   Trades: ${stats.trades}`);
    console.log(`   Signals: ${stats.signals}`);
    console.log(`   Database size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    console.log('\n✅ Database restore completed successfully');
    
    return {
      success: true,
      backupFile: backupPath,
      databasePath: DATABASE_PATH,
      stats,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`\n❌ Restore failed: ${error.message}`);
    throw error;
  }
}

/**
 * Download latest backup from S3
 * @returns {string} Path to downloaded backup
 */
async function downloadLatestFromS3() {
  if (!AWS_S3_BUCKET) {
    throw new Error('AWS_S3_BUCKET not configured');
  }
  
  try {
    const s3 = new S3Client({ region: AWS_REGION });
    
    // List backups in S3
    const listResponse = await s3.send(new ListObjectsV2Command({
      Bucket: AWS_S3_BUCKET,
      Prefix: 'titan-backups/',
      MaxKeys: 100
    }));
    
    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      throw new Error('No backups found in S3');
    }
    
    // Sort by last modified (newest first)
    const backups = listResponse.Contents
      .filter(obj => obj.Key.endsWith('.db.gz'))
      .sort((a, b) => b.LastModified - a.LastModified);
    
    if (backups.length === 0) {
      throw new Error('No valid backups found in S3');
    }
    
    const latestBackup = backups[0];
    console.log(`   Latest backup: ${latestBackup.Key}`);
    console.log(`   Last modified: ${latestBackup.LastModified.toISOString()}`);
    console.log(`   Size: ${(latestBackup.Size / 1024 / 1024).toFixed(2)} MB`);
    
    // Download backup
    const getResponse = await s3.send(new GetObjectCommand({
      Bucket: AWS_S3_BUCKET,
      Key: latestBackup.Key
    }));
    
    // Save to local file
    const localPath = path.join(BACKUP_DIR, path.basename(latestBackup.Key));
    
    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    
    // Write stream to file
    const chunks = [];
    for await (const chunk of getResponse.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    fs.writeFileSync(localPath, buffer);
    
    console.log(`✅ Downloaded to ${localPath}`);
    
    return localPath;
  } catch (error) {
    console.error(`Failed to download from S3: ${error.message}`);
    throw error;
  }
}

/**
 * Verify backup integrity
 * @param {string} backupPath - Path to backup file
 * @returns {boolean} True if backup is valid
 */
async function verifyBackup(backupPath) {
  try {
    // Test gzip integrity
    await execAsync(`gzip -t ${backupPath}`);
    
    // Decompress to temp file and verify SQLite integrity
    const tempFile = `${backupPath}.verify`;
    await execAsync(`gunzip -c ${backupPath} > ${tempFile}`);
    
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
 * Verify database structure and integrity
 * @param {string} dbPath - Path to database file
 * @returns {boolean} True if database is valid
 */
async function verifyDatabase(dbPath) {
  try {
    const sqlite3 = (await import('sqlite3')).default;
    const db = new sqlite3.Database(dbPath);
    
    return new Promise((resolve, reject) => {
      // Check integrity
      db.get('PRAGMA integrity_check', (err, row) => {
        if (err) {
          db.close();
          reject(err);
          return;
        }
        
        if (row && row.integrity_check === 'ok') {
          // Check if required tables exist
          db.all(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name IN ('positions', 'trades', 'signals')
          `, (err, tables) => {
            db.close();
            
            if (err) {
              reject(err);
              return;
            }
            
            // Should have at least positions table
            const hasPositions = tables.some(t => t.name === 'positions');
            resolve(hasPositions);
          });
        } else {
          db.close();
          resolve(false);
        }
      });
    });
  } catch (error) {
    console.error(`Database verification failed: ${error.message}`);
    return false;
  }
}

/**
 * Get database statistics
 * @param {string} dbPath - Path to database file
 * @returns {Object} Database statistics
 */
async function getDatabaseStats(dbPath) {
  try {
    const sqlite3 = (await import('sqlite3')).default;
    const db = new sqlite3.Database(dbPath);
    
    return new Promise((resolve, reject) => {
      const stats = {
        size: fs.statSync(dbPath).size,
        positions: 0,
        trades: 0,
        signals: 0
      };
      
      db.get('SELECT COUNT(*) as count FROM positions', (err, row) => {
        if (!err && row) stats.positions = row.count;
        
        db.get('SELECT COUNT(*) as count FROM trades', (err, row) => {
          if (!err && row) stats.trades = row.count;
          
          db.get('SELECT COUNT(*) as count FROM signals', (err, row) => {
            if (!err && row) stats.signals = row.count;
            
            db.close();
            resolve(stats);
          });
        });
      });
    });
  } catch (error) {
    console.error(`Failed to get database stats: ${error.message}`);
    return {
      size: fs.statSync(dbPath).size,
      positions: 0,
      trades: 0,
      signals: 0
    };
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  latest: args.includes('--latest'),
  fromS3: args.includes('--from-s3'),
  list: args.includes('--list')
};

const backupFile = args.find(arg => !arg.startsWith('--'));

// Run restore if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  if (options.list) {
    console.log('\n📂 Available Backups:\n');
    const backups = listBackups();
    
    if (backups.length === 0) {
      console.log('   No backups found');
    } else {
      backups.forEach((backup, index) => {
        console.log(`   ${index + 1}. ${backup.filename}`);
        console.log(`      Created: ${backup.created.toISOString()}`);
        console.log(`      Size: ${(backup.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`      Age: ${backup.age_days} days`);
        console.log('');
      });
    }
    
    process.exit(0);
  }
  
  restoreDatabase(backupFile, options)
    .then(() => {
      console.log('\n✅ Restore script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error(`\n❌ Restore script failed: ${error.message}`);
      process.exit(1);
    });
}

export { restoreDatabase };
