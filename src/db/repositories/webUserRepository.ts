import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database';
import { dbLogger } from '../../utils/logger';

export interface WebUser {
  id: number;
  username: string;
  passwordHash: string;
  role: 'admin' | 'supervisor' | 'viewer';
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  notes: string | null;
  enabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: number | null;
  createdAt: number;
  tenantId: string | null; // null = super admin (access to all tenants)
}

export interface WebUserPublic {
  id: number;
  username: string;
  role: 'admin' | 'supervisor' | 'viewer';
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  notes: string | null;
  enabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: number | null;
  createdAt: number;
  tenantId: string | null;
}

interface WebUserRow {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  notes: string | null;
  tenant_id: string | null;
  enabled: boolean;
  must_change_password: boolean;
  last_login_at: Date | string | number | null;
  created_at: Date | string | number;
}

function toTimestamp(val: Date | string | number | null): number | null {
  if (!val && val !== 0) return null; // Handle 0? detailed check
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return Math.floor(new Date(val).getTime() / 1000);
  return Math.floor((val as Date).getTime() / 1000);
}

function rowToWebUser(row: WebUserRow): WebUser {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role as WebUser['role'],
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    email: row.email,
    phone: row.phone,
    department: row.department,
    notes: row.notes,
    enabled: row.enabled,
    mustChangePassword: row.must_change_password ?? false,
    lastLoginAt: toTimestamp(row.last_login_at),
    createdAt: toTimestamp(row.created_at) || Math.floor(Date.now() / 1000),
    tenantId: row.tenant_id,
  };
}

function toPublic(user: WebUser): WebUserPublic {
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

export class WebUserRepository {
  constructor(private db: DatabaseManager) { }

  async create(data: {
    username: string;
    passwordHash: string;
    role?: WebUser['role'];
    displayName?: string;
    mustChangePassword?: boolean;
  }): Promise<WebUser> {
    await this.db.run(
      `INSERT INTO web_users (username, password_hash, role, display_name, must_change_password)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        data.username,
        data.passwordHash,
        data.role || 'viewer',
        data.displayName || null,
        data.mustChangePassword ?? false,
      ]
    );

    const user = await this.findByUsername(data.username);
    if (!user) throw new Error('Failed to create user');

    dbLogger.info(`Web user created: ${data.username}`);
    return user;
  }

  async findById(id: number): Promise<WebUser | null> {
    const row = await this.db.get<WebUserRow>(
      'SELECT * FROM web_users WHERE id = $1',
      [id]
    );
    return row ? rowToWebUser(row) : null;
  }

  async findByUsername(username: string): Promise<WebUser | null> {
    const row = await this.db.get<WebUserRow>(
      'SELECT * FROM web_users WHERE username = $1',
      [username]
    );
    return row ? rowToWebUser(row) : null;
  }

  async findAll(): Promise<WebUserPublic[]> {
    const rows = await this.db.all<WebUserRow>(
      'SELECT * FROM web_users ORDER BY created_at DESC'
    );
    return rows.map(rowToWebUser).map(toPublic);
  }

  async findEnabled(): Promise<WebUserPublic[]> {
    const rows = await this.db.all<WebUserRow>(
      'SELECT * FROM web_users WHERE enabled = true ORDER BY created_at DESC'
    );
    return rows.map(rowToWebUser).map(toPublic);
  }

  async update(id: number, updates: {
    username?: string;
    passwordHash?: string;
    role?: WebUser['role'];
    displayName?: string | null;
    avatarUrl?: string | null;
    email?: string | null;
    phone?: string | null;
    department?: string | null;
    notes?: string | null;
    enabled?: boolean;
    mustChangePassword?: boolean;
  }): Promise<boolean> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.username !== undefined) {
      fields.push(`username = $${paramIndex++}`);
      values.push(updates.username);
    }
    if (updates.passwordHash !== undefined) {
      fields.push(`password_hash = $${paramIndex++}`);
      values.push(updates.passwordHash);
    }
    if (updates.role !== undefined) {
      fields.push(`role = $${paramIndex++}`);
      values.push(updates.role);
    }
    if (updates.displayName !== undefined) {
      fields.push(`display_name = $${paramIndex++}`);
      values.push(updates.displayName);
    }
    if (updates.avatarUrl !== undefined) {
      fields.push(`avatar_url = $${paramIndex++}`);
      values.push(updates.avatarUrl);
    }
    if (updates.email !== undefined) {
      fields.push(`email = $${paramIndex++}`);
      values.push(updates.email);
    }
    if (updates.phone !== undefined) {
      fields.push(`phone = $${paramIndex++}`);
      values.push(updates.phone);
    }
    if (updates.department !== undefined) {
      fields.push(`department = $${paramIndex++}`);
      values.push(updates.department);
    }
    if (updates.notes !== undefined) {
      fields.push(`notes = $${paramIndex++}`);
      values.push(updates.notes);
    }
    if (updates.enabled !== undefined) {
      fields.push(`enabled = $${paramIndex++}`);
      values.push(!!updates.enabled);
    }
    if (updates.mustChangePassword !== undefined) {
      fields.push(`must_change_password = $${paramIndex++}`);
      values.push(!!updates.mustChangePassword);
    }

    if (fields.length === 0) return false;

    values.push(id);
    const result = await this.db.run(
      `UPDATE web_users SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    return result.rowCount > 0;
  }

  async clearMustChangePassword(id: number): Promise<boolean> {
    const result = await this.db.run(
      'UPDATE web_users SET must_change_password = false WHERE id = $1',
      [id]
    );
    return result.rowCount > 0;
  }

  async updateLastLogin(id: number): Promise<void> {
    await this.db.run(
      'UPDATE web_users SET last_login_at = EXTRACT(EPOCH FROM NOW())::INTEGER WHERE id = $1',
      [id]
    );
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.db.run('DELETE FROM web_users WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  async count(): Promise<number> {
    const result = await this.db.get<{ count: string }>(
      'SELECT COUNT(*) as count FROM web_users'
    );
    return result ? parseInt(result.count, 10) : 0;
  }

  async countByRole(role: WebUser['role']): Promise<number> {
    const result = await this.db.get<{ count: string }>(
      'SELECT COUNT(*) as count FROM web_users WHERE role = $1',
      [role]
    );
    return result ? parseInt(result.count, 10) : 0;
  }
}
