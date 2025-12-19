/**
 * Base Repository
 * Abstract base class for all repositories with common functionality
 * 
 * Requirements: 9.1, 9.2, 9.3
 */

import { DatabaseManager } from '../DatabaseManager.js';
import { QueryResultRow } from 'pg';

export abstract class BaseRepository<T extends QueryResultRow> {
  protected db: DatabaseManager;
  protected tableName: string;

  constructor(db: DatabaseManager, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  /**
   * Find a record by ID
   */
  async findById(id: number): Promise<T | null> {
    return this.db.queryOne<T>(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
  }

  /**
   * Find all records with optional limit and offset
   */
  async findAll(limit?: number, offset?: number): Promise<T[]> {
    let query = `SELECT * FROM ${this.tableName} ORDER BY id DESC`;
    const params: unknown[] = [];
    
    if (limit !== undefined) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(limit);
    }
    
    if (offset !== undefined) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(offset);
    }
    
    return this.db.queryAll<T>(query, params);
  }

  /**
   * Count all records
   */
  async count(): Promise<number> {
    const result = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.tableName}`
    );
    return parseInt(result?.count || '0', 10);
  }

  /**
   * Delete a record by ID
   */
  async deleteById(id: number): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    return (result.rowCount || 0) > 0;
  }

  /**
   * Delete records older than a timestamp
   */
  async deleteOlderThan(timestamp: number): Promise<number> {
    const result = await this.db.query(
      `DELETE FROM ${this.tableName} WHERE timestamp < $1`,
      [timestamp]
    );
    return result.rowCount || 0;
  }
}
