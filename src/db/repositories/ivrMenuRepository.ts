import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database';
import { IVRMenu, IVRMenuWithOptions, IVROption } from '../../models/types';
import { dbLogger } from '../../utils/logger';

interface MenuRow {
  id: string;
  name: string;
  welcome_prompt_id: string | null;
  invalid_prompt_id: string | null;
  timeout_prompt_id: string | null;
  timeout_seconds: number;
  max_retries: number;
  created_at: Date | string;
  tenant_id: string;
}

interface OptionRow {
  id: string;
  menu_id: string;
  key_press: string;
  action_type: string;
  destination: string | null;
  pre_connect_prompt_id: string | null;
  post_call_prompt_id: string | null;
  transfer_trunk_id: string | null;
  transfer_destination: string | null;
  transfer_mode: string | null;
}

function rowToMenu(row: MenuRow): IVRMenu & { tenantId: string } {
  return {
    id: row.id,
    name: row.name,
    welcomePromptId: row.welcome_prompt_id,
    invalidPromptId: row.invalid_prompt_id,
    timeoutPromptId: row.timeout_prompt_id,
    timeoutSeconds: row.timeout_seconds,
    maxRetries: row.max_retries,
    createdAt: typeof row.created_at === 'string' ? new Date(row.created_at).getTime() / 1000 : Math.floor(new Date(row.created_at).getTime() / 1000),
    tenantId: row.tenant_id,
  };
}

function rowToOption(row: OptionRow): IVROption {
  return {
    id: row.id,
    menuId: row.menu_id,
    keyPress: row.key_press,
    actionType: row.action_type as IVROption['actionType'],
    destination: row.destination,
    preConnectPromptId: row.pre_connect_prompt_id,
    postCallPromptId: row.post_call_prompt_id,
    transferTrunkId: row.transfer_trunk_id,
    transferDestination: row.transfer_destination,
    transferMode: (row.transfer_mode || 'internal') as 'internal' | 'trunk',
  };
}

export class IVRMenuRepository {
  constructor(private db: DatabaseManager) {}

  /**
   * Create a new IVR menu
   * @param menu IVR menu data
   * @param tenantId Tenant ID (required for multi-tenant)
   */
  async create(menu: Omit<IVRMenu, 'id' | 'createdAt'>, tenantId: string = 'default'): Promise<IVRMenu & { tenantId: string }> {
    const id = uuidv4();
    const createdAt = Math.floor(Date.now() / 1000);

    await this.db.run(
      `INSERT INTO ivr_menus (id, name, welcome_prompt_id, invalid_prompt_id, timeout_prompt_id, timeout_seconds, max_retries, created_at, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        menu.name,
        menu.welcomePromptId,
        menu.invalidPromptId,
        menu.timeoutPromptId,
        menu.timeoutSeconds,
        menu.maxRetries,
        createdAt,
        tenantId,
      ]
    );

    dbLogger.info(`IVR Menu created: ${id} (${menu.name}) for tenant ${tenantId}`);

    return {
      id,
      ...menu,
      createdAt,
      tenantId,
    };
  }

  /**
   * Get a menu by ID
   * @param id Menu ID
   * @param tenantId Tenant ID (optional)
   */
  async findById(id: string, tenantId?: string): Promise<(IVRMenu & { tenantId: string }) | null> {
    let query = 'SELECT * FROM ivr_menus WHERE id = $1';
    const params: unknown[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const row = await this.db.get<MenuRow>(query, params);
    return row ? rowToMenu(row) : null;
  }

  /**
   * Get a menu with its options
   * @param id Menu ID
   * @param tenantId Tenant ID (optional)
   */
  async findByIdWithOptions(id: string, tenantId?: string): Promise<(IVRMenuWithOptions & { tenantId: string }) | null> {
    let query = 'SELECT * FROM ivr_menus WHERE id = $1';
    const params: unknown[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const menuRow = await this.db.get<MenuRow>(query, params);
    if (!menuRow) return null;

    const optionRows = await this.db.all<OptionRow>(
      'SELECT * FROM ivr_options WHERE menu_id = $1 ORDER BY key_press',
      [id]
    );

    return {
      ...rowToMenu(menuRow),
      options: optionRows.map(rowToOption),
    };
  }

  /**
   * Get all menus
   * @param tenantId Tenant ID (optional)
   */
  async findAll(tenantId?: string): Promise<(IVRMenu & { tenantId: string })[]> {
    let query = 'SELECT * FROM ivr_menus';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    query += ' ORDER BY created_at DESC';

    const rows = await this.db.all<MenuRow>(query, params);
    return rows.map(rowToMenu);
  }

  /**
   * Get all menus with their options
   * @param tenantId Tenant ID (optional)
   */
  async findAllWithOptions(tenantId?: string): Promise<(IVRMenuWithOptions & { tenantId: string })[]> {
    const menus = await this.findAll(tenantId);
    const results: (IVRMenuWithOptions & { tenantId: string })[] = [];

    for (const menu of menus) {
      const optionRows = await this.db.all<OptionRow>(
        'SELECT * FROM ivr_options WHERE menu_id = $1 ORDER BY key_press',
        [menu.id]
      );
      results.push({
        ...menu,
        options: optionRows.map(rowToOption),
      });
    }

    return results;
  }

  /**
   * Update a menu
   * @param id Menu ID
   * @param updates Fields to update
   * @param tenantId Tenant ID (required for security)
   */
  async update(id: string, updates: Partial<Omit<IVRMenu, 'id' | 'createdAt'>>, tenantId?: string): Promise<boolean> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.welcomePromptId !== undefined) {
      fields.push(`welcome_prompt_id = $${paramIndex++}`);
      values.push(updates.welcomePromptId);
    }
    if (updates.invalidPromptId !== undefined) {
      fields.push(`invalid_prompt_id = $${paramIndex++}`);
      values.push(updates.invalidPromptId);
    }
    if (updates.timeoutPromptId !== undefined) {
      fields.push(`timeout_prompt_id = $${paramIndex++}`);
      values.push(updates.timeoutPromptId);
    }
    if (updates.timeoutSeconds !== undefined) {
      fields.push(`timeout_seconds = $${paramIndex++}`);
      values.push(updates.timeoutSeconds);
    }
    if (updates.maxRetries !== undefined) {
      fields.push(`max_retries = $${paramIndex++}`);
      values.push(updates.maxRetries);
    }

    if (fields.length === 0) return false;

    let query = `UPDATE ivr_menus SET ${fields.join(', ')} WHERE id = $${paramIndex++}`;
    values.push(id);

    if (tenantId) {
      query += ` AND tenant_id = $${paramIndex}`;
      values.push(tenantId);
    }

    const result = await this.db.run(query, values);

    return result.rowCount > 0;
  }

  /**
   * Delete a menu and all its options
   * @param id Menu ID
   * @param tenantId Tenant ID (required for security)
   */
  async delete(id: string, tenantId?: string): Promise<boolean> {
    let query = 'DELETE FROM ivr_menus WHERE id = $1';
    const params: unknown[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const result = await this.db.run(query, params);
    if (result.rowCount > 0) {
      dbLogger.info(`IVR Menu deleted: ${id}`);
    }
    return result.rowCount > 0;
  }

  // =====================
  // IVR Option methods
  // =====================

  /**
   * Add an option to a menu
   */
  async addOption(option: Omit<IVROption, 'id'>): Promise<IVROption> {
    const id = uuidv4();

    await this.db.run(
      `INSERT INTO ivr_options (id, menu_id, key_press, action_type, destination, pre_connect_prompt_id, post_call_prompt_id, transfer_trunk_id, transfer_destination, transfer_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        option.menuId,
        option.keyPress,
        option.actionType,
        option.destination,
        option.preConnectPromptId,
        option.postCallPromptId,
        option.transferTrunkId || null,
        option.transferDestination || null,
        option.transferMode || 'internal',
      ]
    );

    dbLogger.info(`IVR Option added: ${option.keyPress} to menu ${option.menuId}`);

    return { id, ...option };
  }

  /**
   * Get an option by ID
   */
  async findOptionById(id: string): Promise<IVROption | null> {
    const row = await this.db.get<OptionRow>('SELECT * FROM ivr_options WHERE id = $1', [id]);
    return row ? rowToOption(row) : null;
  }

  /**
   * Get options for a menu
   */
  async findOptionsByMenuId(menuId: string): Promise<IVROption[]> {
    const rows = await this.db.all<OptionRow>(
      'SELECT * FROM ivr_options WHERE menu_id = $1 ORDER BY key_press',
      [menuId]
    );
    return rows.map(rowToOption);
  }

  /**
   * Get an option by menu ID and key press
   */
  async findOptionByKey(menuId: string, keyPress: string): Promise<IVROption | null> {
    const row = await this.db.get<OptionRow>(
      'SELECT * FROM ivr_options WHERE menu_id = $1 AND key_press = $2',
      [menuId, keyPress]
    );
    return row ? rowToOption(row) : null;
  }

  /**
   * Update an option
   */
  async updateOption(id: string, updates: Partial<Omit<IVROption, 'id' | 'menuId'>>): Promise<boolean> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.keyPress !== undefined) {
      fields.push(`key_press = $${paramIndex++}`);
      values.push(updates.keyPress);
    }
    if (updates.actionType !== undefined) {
      fields.push(`action_type = $${paramIndex++}`);
      values.push(updates.actionType);
    }
    if (updates.destination !== undefined) {
      fields.push(`destination = $${paramIndex++}`);
      values.push(updates.destination);
    }
    if (updates.preConnectPromptId !== undefined) {
      fields.push(`pre_connect_prompt_id = $${paramIndex++}`);
      values.push(updates.preConnectPromptId);
    }
    if (updates.postCallPromptId !== undefined) {
      fields.push(`post_call_prompt_id = $${paramIndex++}`);
      values.push(updates.postCallPromptId);
    }
    if (updates.transferTrunkId !== undefined) {
      fields.push(`transfer_trunk_id = $${paramIndex++}`);
      values.push(updates.transferTrunkId);
    }
    if (updates.transferDestination !== undefined) {
      fields.push(`transfer_destination = $${paramIndex++}`);
      values.push(updates.transferDestination);
    }
    if (updates.transferMode !== undefined) {
      fields.push(`transfer_mode = $${paramIndex++}`);
      values.push(updates.transferMode);
    }

    if (fields.length === 0) return false;

    values.push(id);
    const result = await this.db.run(
      `UPDATE ivr_options SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    return result.rowCount > 0;
  }

  /**
   * Delete an option
   */
  async deleteOption(id: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM ivr_options WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  /**
   * Delete all options for a menu
   */
  async deleteOptionsByMenuId(menuId: string): Promise<number> {
    const result = await this.db.run('DELETE FROM ivr_options WHERE menu_id = $1', [menuId]);
    return result.rowCount;
  }

  /**
   * Count menus
   * @param tenantId Tenant ID (optional)
   */
  async count(tenantId?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM ivr_menus';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    const result = await this.db.get<{ count: string }>(query, params);
    return result ? parseInt(result.count, 10) : 0;
  }

  /**
   * Get all IVR menus for Asterisk config generation (all tenants)
   * Used internally for dialplan configuration
   */
  async findAllForAsterisk(): Promise<(IVRMenuWithOptions & { tenantId: string })[]> {
    const rows = await this.db.all<MenuRow>(
      'SELECT * FROM ivr_menus ORDER BY tenant_id, name'
    );
    const results: (IVRMenuWithOptions & { tenantId: string })[] = [];

    for (const row of rows) {
      const menu = rowToMenu(row);
      const optionRows = await this.db.all<OptionRow>(
        'SELECT * FROM ivr_options WHERE menu_id = $1 ORDER BY key_press',
        [menu.id]
      );
      results.push({
        ...menu,
        options: optionRows.map(rowToOption),
      });
    }

    return results;
  }
}
