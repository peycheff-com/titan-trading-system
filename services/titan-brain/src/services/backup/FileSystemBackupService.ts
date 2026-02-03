import * as fs from 'fs';
import * as path from 'path';
import { RecoveredState } from '../../engine/stateRecoveryTypes.js';
import { Logger } from '../../logging/Logger.js';

export interface BackupMetadata {
  id: string;
  timestamp: number;
  size: number;
  version: string;
}

export class FileSystemBackupService {
  private readonly backupDir: string;
  private readonly logger: Logger;

  constructor(backupDir: string = 'data/backups') {
    this.backupDir = path.resolve(process.cwd(), backupDir);
    this.logger = Logger.getInstance('backup-service');
    this.ensureBackupDir();
  }

  private ensureBackupDir(): void {
    if (!fs.existsSync(this.backupDir)) {
      try {
        fs.mkdirSync(this.backupDir, { recursive: true });
        this.logger.info(`Created backup directory at ${this.backupDir}`);
      } catch (error) {
        this.logger.error(`Failed to create backup directory: ${(error as Error).message}`);
      }
    }
  }

  async createBackup(state: RecoveredState): Promise<string> {
    const timestamp = Date.now();
    const backupId = `backup_${timestamp}`;
    const filename = `${backupId}.json`;
    const filePath = path.join(this.backupDir, filename);

    const backupData = {
      metadata: {
        id: backupId,
        timestamp,
        version: '1.0.0',
      },
      state,
    };

    try {
      await fs.promises.writeFile(filePath, JSON.stringify(backupData, null, 2));
      this.logger.info(`Backup created successfully: ${backupId}`);
      return backupId;
    } catch (error) {
      this.logger.error(`Failed to create backup: ${(error as Error).message}`);
      throw error;
    }
  }

  async loadBackup(backupId: string): Promise<RecoveredState> {
    // Sanitize backupId to prevent directory traversal
    const safeId = path.basename(backupId);
    let filename = safeId;
    if (!filename.endsWith('.json')) {
      filename += '.json';
    }

    const filePath = path.join(this.backupDir, filename);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    try {
      const data = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data);

      if (!parsed.state) {
        throw new Error('Invalid backup format: missing state object');
      }

      this.logger.info(`Backup loaded successfully: ${backupId}`);
      return parsed.state as RecoveredState;
    } catch (error) {
      this.logger.error(`Failed to load backup ${backupId}: ${(error as Error).message}`);
      throw error;
    }
  }

  async listBackups(): Promise<BackupMetadata[]> {
    try {
      const files = await fs.promises.readdir(this.backupDir);
      const backups: BackupMetadata[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const filePath = path.join(this.backupDir, file);
          const stats = await fs.promises.stat(filePath);
          const id = path.basename(file, '.json');

          backups.push({
            id,
            timestamp: stats.mtimeMs, // Using file modification time as fallback
            size: stats.size,
            version: '1.0.0',
          });
        } catch (err) {
          // Skip unreadable files
        }
      }

      // Sort by timestamp descending (newest first)
      return backups.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      this.logger.error(`Failed to list backups: ${(error as Error).message}`);
      return [];
    }
  }
}
