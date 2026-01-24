import { Pool, PoolClient, QueryResult } from 'pg';
import { dbLogger } from '../utils/logger';
import { runMigrations } from './migrations';

export interface RunResult {
  rowCount: number;
  lastInsertId?: number | bigint;
}

export class DatabaseManager {
  private pool: Pool;
  private isPostgres: boolean = true;

  constructor(connectionString: string) {
    // Parse connection string or use individual params
    if (connectionString.startsWith('postgresql://') || connectionString.startsWith('postgres://')) {
      this.pool = new Pool({
        connectionString,
        max: 20, // Connection pool size
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });
    } else {
      // Support individual environment variables
      this.pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'botpbx',
        user: process.env.DB_USER || 'botpbx',
        password: process.env.DB_PASSWORD,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });
    }

    this.pool.on('error', (err) => {
      dbLogger.error('Unexpected PostgreSQL pool error:', err);
    });

    dbLogger.info('PostgreSQL connection pool initialized');
  }

  /**
   * Get a client from the pool (for transactions)
   */
  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  /**
   * Execute a query and return all results
   */
  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    try {
      const converted = this.convertParams(params);
      const result = await this.pool.query(sql, converted);
      return this.convertRows(result.rows) as T[];
    } catch (error) {
      dbLogger.error('Query error:', { sql, params, error });
      throw error;
    }
  }

  /**
   * Execute a query and return first result
   */
  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    try {
      const converted = this.convertParams(params);
      const result = await this.pool.query(sql, converted);
      if (result.rows.length === 0) {
        return undefined;
      }
      return this.convertRow(result.rows[0]) as T;
    } catch (error) {
      dbLogger.error('Query error:', { sql, params, error });
      throw error;
    }
  }

  /**
   * Execute a query (INSERT, UPDATE, DELETE)
   */
  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    try {
      const converted = this.convertParams(params);
      const result = await this.pool.query(sql, converted);
      return {
        rowCount: result.rowCount || 0,
        lastInsertId: this.extractInsertId(result),
      };
    } catch (error) {
      dbLogger.error('Query error (run):', { sql, params, error });
      throw error;
    }
  }

  /**
   * Execute multiple statements in a transaction
   */
  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute raw SQL (for migrations/schema)
   */
  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  /**
   * Run the schema/migrations
   */
  async initSchema(): Promise<void> {
    // Create schema version table
    await this.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      );
    `);

    await runMigrations(this);
  }

  /**
   * Close the database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    dbLogger.info('PostgreSQL connection pool closed');
  }

  /**
   * Check if a table exists
   */
  async tableExists(tableName: string): Promise<boolean> {
    const result = await this.get<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = $1
      ) as exists`,
      [tableName]
    );
    return result?.exists ?? false;
  }

  /**
   * Get current schema version
   */
  async getSchemaVersion(): Promise<number> {
    try {
      const result = await this.get<{ version: number }>(
        'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
      );
      return result?.version ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Set schema version
   */
  async setSchemaVersion(version: number): Promise<void> {
    await this.run(
      `INSERT INTO schema_version (version) VALUES ($1)
       ON CONFLICT (version) DO NOTHING`,
      [version]
    );
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Convert boolean parameters for PostgreSQL (already native)
   */
  private convertParams(params: unknown[]): unknown[] {
    return params.map(p => {
      // PostgreSQL handles booleans natively, but convert numbers to bool if needed
      if (typeof p === 'number' && (p === 0 || p === 1)) {
        // Keep as number - PostgreSQL can handle 0/1 for boolean columns
        return p;
      }
      return p;
    });
  }

  /**
   * Convert PostgreSQL row to match expected format
   * Converts snake_case to camelCase and handles type conversions
   */
  private convertRow(row: Record<string, unknown>): Record<string, unknown> {
    const converted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      // Convert snake_case to camelCase for some fields
      const camelKey = this.snakeToCamel(key);
      converted[camelKey] = value;
      // Also keep original snake_case key for backward compatibility
      if (camelKey !== key) {
        converted[key] = value;
      }
    }
    return converted;
  }

  /**
   * Convert multiple rows
   */
  private convertRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    return rows.map(row => this.convertRow(row));
  }

  /**
   * Extract insert ID from result (for RETURNING clause)
   */
  private extractInsertId(result: QueryResult): number | bigint | undefined {
    if (result.rows.length > 0 && result.rows[0].id !== undefined) {
      return result.rows[0].id;
    }
    return undefined;
  }

  /**
   * Convert snake_case to camelCase
   */
  private snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }
}

// Singleton instance
let dbInstance: DatabaseManager | null = null;

export async function initDatabase(connectionString?: string): Promise<DatabaseManager> {
  if (dbInstance) {
    return dbInstance;
  }

  // Use connection string from env or parameter
  const connStr = connectionString ||
    process.env.DATABASE_URL ||
    `postgresql://${process.env.DB_USER || 'botpbx'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'botpbx'}`;

  dbInstance = new DatabaseManager(connStr);

  // Initialize schema on first connection
  await dbInstance.initSchema();

  return dbInstance;
}

export function getDatabase(): DatabaseManager {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase first.');
  }
  return dbInstance;
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}
