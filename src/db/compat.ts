/**
 * Database Compatibility Layer
 * Provides async interface for PostgreSQL database operations
 * Maps to the DatabaseManager singleton
 */

import { getDatabase } from './database';

/**
 * Compatibility wrapper for database operations
 * All methods are async for PostgreSQL compatibility
 */
export const db = {
  /**
   * Query multiple rows
   */
  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const dbManager = getDatabase();
    return dbManager.all<T>(sql, params);
  },

  /**
   * Query single row
   */
  async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const dbManager = getDatabase();
    return dbManager.get<T>(sql, params);
  },

  /**
   * Execute insert/update/delete
   */
  async run(sql: string, params: unknown[] = []): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
    const dbManager = getDatabase();
    const result = await dbManager.run(sql, params);
    return {
      changes: result.rowCount,
      lastInsertRowid: result.lastInsertId ?? 0,
    };
  },

  /**
   * Execute raw SQL (for schema operations)
   */
  async exec(sql: string): Promise<void> {
    const dbManager = getDatabase();
    return dbManager.exec(sql);
  },

  /**
   * Run operations in a transaction
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const dbManager = getDatabase();
    return dbManager.transaction(async () => {
      return fn();
    });
  },
};

/**
 * Sync-compatible wrapper for legacy code
 * Note: These methods MUST be called with await in the calling code
 * They return Promises but maintain the same method signatures
 */
export const syncDb = db;
