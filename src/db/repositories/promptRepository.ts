import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database';
import { Prompt } from '../../models/types';
import { dbLogger } from '../../utils/logger';

interface PromptRow {
  id: string;
  name: string;
  type: string;
  file_path: string | null;
  text: string | null;
  voice: string | null;
  tenant_id: string;
  created_at: Date | string;
}

function rowToPrompt(row: PromptRow): Prompt & { tenantId: string } {
  return {
    id: row.id,
    name: row.name,
    type: row.type as 'tts' | 'uploaded',
    filePath: row.file_path,
    text: row.text,
    voice: row.voice,
    tenantId: row.tenant_id,
    createdAt: typeof row.created_at === 'string' ? new Date(row.created_at).getTime() / 1000 : Math.floor(new Date(row.created_at).getTime() / 1000),
  };
}

export class PromptRepository {
  constructor(private db: DatabaseManager) {}

  /**
   * Create a new prompt
   */
  async create(prompt: Omit<Prompt, 'id' | 'createdAt'>, tenantId: string = 'default'): Promise<Prompt & { tenantId: string }> {
    const id = uuidv4();
    const createdAt = Math.floor(Date.now() / 1000);

    await this.db.run(
      `INSERT INTO prompts (id, name, type, file_path, text, voice, tenant_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [id, prompt.name, prompt.type, prompt.filePath, prompt.text, prompt.voice, tenantId]
    );

    dbLogger.info(`Prompt created: ${id} (${prompt.name}) for tenant ${tenantId}`);

    return {
      id,
      ...prompt,
      tenantId,
      createdAt,
    };
  }

  /**
   * Get a prompt by ID
   */
  async findById(id: string, tenantId?: string): Promise<(Prompt & { tenantId: string }) | null> {
    let query = 'SELECT * FROM prompts WHERE id = $1';
    const params: unknown[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const row = await this.db.get<PromptRow>(query, params);
    return row ? rowToPrompt(row) : null;
  }

  /**
   * Get a prompt by name
   */
  async findByName(name: string, tenantId?: string): Promise<(Prompt & { tenantId: string }) | null> {
    let query = 'SELECT * FROM prompts WHERE name = $1';
    const params: unknown[] = [name];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const row = await this.db.get<PromptRow>(query, params);
    return row ? rowToPrompt(row) : null;
  }

  /**
   * Get all prompts
   */
  async findAll(tenantId?: string): Promise<(Prompt & { tenantId: string })[]> {
    let query = 'SELECT * FROM prompts';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    query += ' ORDER BY created_at DESC';

    const rows = await this.db.all<PromptRow>(query, params);
    return rows.map(rowToPrompt);
  }

  /**
   * Get all prompts for Asterisk config generation (all tenants)
   */
  async findAllForAsterisk(): Promise<(Prompt & { tenantId: string })[]> {
    const rows = await this.db.all<PromptRow>(
      'SELECT * FROM prompts ORDER BY tenant_id, name'
    );
    return rows.map(rowToPrompt);
  }

  /**
   * Get prompts by type
   */
  async findByType(type: 'tts' | 'uploaded', tenantId?: string): Promise<(Prompt & { tenantId: string })[]> {
    let query = 'SELECT * FROM prompts WHERE type = $1';
    const params: unknown[] = [type];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    query += ' ORDER BY created_at DESC';

    const rows = await this.db.all<PromptRow>(query, params);
    return rows.map(rowToPrompt);
  }

  /**
   * Update a prompt
   */
  async update(id: string, updates: Partial<Omit<Prompt, 'id' | 'createdAt'>>, tenantId?: string): Promise<boolean> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.type !== undefined) {
      fields.push(`type = $${paramIndex++}`);
      values.push(updates.type);
    }
    if (updates.filePath !== undefined) {
      fields.push(`file_path = $${paramIndex++}`);
      values.push(updates.filePath);
    }
    if (updates.text !== undefined) {
      fields.push(`text = $${paramIndex++}`);
      values.push(updates.text);
    }
    if (updates.voice !== undefined) {
      fields.push(`voice = $${paramIndex++}`);
      values.push(updates.voice);
    }

    if (fields.length === 0) {
      return false;
    }

    let query = `UPDATE prompts SET ${fields.join(', ')} WHERE id = $${paramIndex++}`;
    values.push(id);

    if (tenantId) {
      query += ` AND tenant_id = $${paramIndex}`;
      values.push(tenantId);
    }

    const result = await this.db.run(query, values);

    if (result.rowCount > 0) {
      dbLogger.info(`Prompt updated: ${id}`);
    }

    return result.rowCount > 0;
  }

  /**
   * Delete a prompt
   */
  async delete(id: string, tenantId?: string): Promise<boolean> {
    let query = 'DELETE FROM prompts WHERE id = $1';
    const params: unknown[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const result = await this.db.run(query, params);
    if (result.rowCount > 0) {
      dbLogger.info(`Prompt deleted: ${id}`);
    }
    return result.rowCount > 0;
  }

  /**
   * Count prompts
   */
  async count(tenantId?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM prompts';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    const result = await this.db.get<{ count: string }>(query, params);
    return result ? parseInt(result.count, 10) : 0;
  }

  /**
   * Get prompts with pagination
   */
  async findPaginated(limit: number, offset: number, tenantId?: string): Promise<(Prompt & { tenantId: string })[]> {
    let query = 'SELECT * FROM prompts';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (tenantId) {
      query += ` WHERE tenant_id = $${paramIndex++}`;
      params.push(tenantId);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const rows = await this.db.all<PromptRow>(query, params);
    return rows.map(rowToPrompt);
  }
}
