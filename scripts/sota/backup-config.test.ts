/**
 * Backup Configuration Validation Tests — M18 Disaster Recovery
 *
 * Validates that cron schedules, backup scripts, and wrapper scripts
 * are correctly configured and aligned.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

describe('M18 Backup Configuration Validation', () => {
  // ─── Cron Schedule ───────────────────────────────────────────────
  describe('titan-backups.cron', () => {
    const cronPath = path.join(ROOT, 'infra/cron/titan-backups.cron');
    const cronContent = fs.readFileSync(cronPath, 'utf-8');

    it('cron file exists', () => {
      expect(fs.existsSync(cronPath)).toBe(true);
    });

    it('has 5 scheduled jobs', () => {
      const scheduleLines = cronContent.split('\n').filter((l) => /^\d/.test(l.trim()));
      expect(scheduleLines.length).toBe(5);
    });

    it('references backup-production.sh for JetStream', () => {
      expect(cronContent).toContain('backup-production.sh jetstream');
    });

    it('references backup-production.sh for postgres', () => {
      expect(cronContent).toContain('backup-production.sh postgres');
    });

    it('references backup-production.sh for redis', () => {
      expect(cronContent).toContain('backup-production.sh redis');
    });

    it('references backup-production.sh for verify', () => {
      expect(cronContent).toContain('backup-production.sh verify');
    });

    it('references verify-exchange-whitelist.sh', () => {
      expect(cronContent).toContain('verify-exchange-whitelist.sh');
    });

    it('sends logs to /var/log/titan/', () => {
      expect(cronContent).toContain('/var/log/titan/');
    });

    it('has MAILTO configured', () => {
      expect(cronContent).toMatch(/MAILTO=\S+/);
    });
  });

  // ─── Main Backup Script ──────────────────────────────────────────
  describe('backup-production.sh', () => {
    const scriptPath = path.join(ROOT, 'scripts/ops/backup-production.sh');
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

    it('script exists', () => {
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it('starts with set -e', () => {
      expect(scriptContent).toContain('set -e');
    });

    it('accepts all|jetstream|postgres|redis|verify modes', () => {
      expect(scriptContent).toContain('jetstream)');
      expect(scriptContent).toContain('postgres)');
      expect(scriptContent).toContain('redis)');
      expect(scriptContent).toContain('verify)');
      expect(scriptContent).toContain('all)');
    });

    it('has cleanup of old snapshots', () => {
      expect(scriptContent).toContain('Cleaning up old');
    });

    it('has backup verification that checks age', () => {
      expect(scriptContent).toContain('AGE_HOURS');
    });

    it('uploads to DigitalOcean Spaces when available', () => {
      expect(scriptContent).toContain('s3cmd put');
    });
  });

  // ─── 05_backup.sh Wrapper ────────────────────────────────────────
  describe('05_backup.sh wrapper', () => {
    const wrapperPath = path.join(ROOT, 'scripts/ops/do/05_backup.sh');
    const wrapperContent = fs.readFileSync(wrapperPath, 'utf-8');

    it('wrapper exists', () => {
      expect(fs.existsSync(wrapperPath)).toBe(true);
    });

    it('uses set -euo pipefail', () => {
      expect(wrapperContent).toContain('set -euo pipefail');
    });

    it('passes "all" for full backup (not --all or empty)', () => {
      expect(wrapperContent).toContain('"$BACKUP_SCRIPT" all');
    });

    it('passes "postgres" for DB backup (not --db-only)', () => {
      expect(wrapperContent).toContain('"$BACKUP_SCRIPT" postgres');
      expect(wrapperContent).not.toContain('--db-only');
    });

    it('passes "jetstream" for JetStream backup (not --jetstream-only)', () => {
      expect(wrapperContent).toContain('"$BACKUP_SCRIPT" jetstream');
      expect(wrapperContent).not.toContain('--jetstream-only');
    });
  });

  // ─── Shell Script Hardening ──────────────────────────────────────
  describe('Shell script hardening', () => {
    const scripts = [
      'scripts/backup-db.sh',
      'scripts/db/backup.sh',
      'services/titan-brain/scripts/backup_db.sh',
    ];

    it.each(scripts)('%s starts with set -euo pipefail', (script) => {
      const content = fs.readFileSync(path.join(ROOT, script), 'utf-8');
      expect(content).toContain('set -euo pipefail');
    });
  });

  // ─── Exchange Whitelist Script ───────────────────────────────────
  describe('verify-exchange-whitelist.sh', () => {
    const scriptPath = path.join(ROOT, 'scripts/ops/verify-exchange-whitelist.sh');
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

    it('script exists', () => {
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it('starts with set -e', () => {
      expect(scriptContent).toContain('set -e');
    });

    it('checks Binance', () => {
      expect(scriptContent).toContain('check_binance');
    });

    it('checks Bybit', () => {
      expect(scriptContent).toContain('check_bybit');
    });

    it('checks MEXC', () => {
      expect(scriptContent).toContain('check_mexc');
    });

    it('uses HMAC-SHA256 for signing', () => {
      expect(scriptContent).toContain('openssl dgst -sha256 -hmac');
    });
  });

  // ─── FileSystemBackupService ─────────────────────────────────────
  describe('FileSystemBackupService.ts', () => {
    const tsPath = path.join(ROOT, 'services/titan-brain/src/services/backup/FileSystemBackupService.ts');
    const tsContent = fs.readFileSync(tsPath, 'utf-8');

    it('source file exists', () => {
      expect(fs.existsSync(tsPath)).toBe(true);
    });

    it('has directory traversal protection', () => {
      expect(tsContent).toContain('path.basename');
    });

    it('uses Logger (not console.log)', () => {
      expect(tsContent).not.toContain('console.log');
      expect(tsContent).toContain('Logger');
    });

    it('has error handling in all async methods', () => {
      const tryCatchCount = (tsContent.match(/try\s*\{/g) || []).length;
      expect(tryCatchCount).toBeGreaterThanOrEqual(3);
    });
  });

  // ─── Restore Scripts ─────────────────────────────────────────────
  describe('Restore scripts', () => {
    it('restore-drill.sh exists', () => {
      expect(fs.existsSync(path.join(ROOT, 'scripts/ops/restore-drill.sh'))).toBe(true);
    });

    it('06_restore_drill.sh exists', () => {
      expect(fs.existsSync(path.join(ROOT, 'scripts/ops/do/06_restore_drill.sh'))).toBe(true);
    });

    it('restore-db.sh exists', () => {
      expect(fs.existsSync(path.join(ROOT, 'scripts/restore-db.sh'))).toBe(true);
    });

    it('restore-drill.sh has cleanup trap', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/ops/restore-drill.sh'), 'utf-8');
      expect(content).toContain('trap cleanup EXIT');
    });

    it('06_restore_drill.sh has safety confirmation for execute mode', () => {
      const content = fs.readFileSync(path.join(ROOT, 'scripts/ops/do/06_restore_drill.sh'), 'utf-8');
      expect(content).toContain('--execute');
      expect(content).toContain('Are you sure');
    });
  });
});
