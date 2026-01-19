import { DatabaseManager } from '../database';
import { dbLogger } from '../../utils/logger';

// All available permissions in the system
export const ALL_PERMISSIONS = [
  // Dashboard
  'dashboard.view',
  // Calls
  'calls.view',
  'calls.spy',
  'calls.hangup',
  // Recordings
  'recordings.view',
  'recordings.delete',
  'recordings.download',
  'recordings.edit', // Deprecated, kept for backward compatibility if any
  'recordings.manage',
  // Extensions
  'extensions.view',
  'extensions.manage',
  // Trunks
  'trunks.view',
  'trunks.manage',
  'trunks.test',
  // IVR
  'ivr.view',
  'ivr.manage',
  // Queues
  'queues.view',
  'queues.manage',
  // Campaigns
  'campaigns.view',
  'campaigns.manage',
  'campaigns.start_stop',
  // Contacts
  'contacts.view',
  'contacts.manage',
  'contacts.import',
  'contacts.export',
  // Prompts
  'prompts.view',
  'prompts.manage',
  // Routing
  'routing.view',
  'routing.manage',
  // Ring Groups
  'ring_groups.view',
  'ring_groups.manage',
  // Analytics
  'analytics.view',
  // Settings
  'settings.view',
  'settings.manage',
  // Users
  'users.view',
  'users.manage',
  // System
  'system.view',
  'system.manage',
  // Tenants (multi-tenant management)
  'tenants.view',
  'tenants.manage',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

// Default permissions for each role
export const ROLE_DEFAULT_PERMISSIONS: Record<string, Permission[]> = {
  admin: [...ALL_PERMISSIONS], // Admin gets all permissions
  supervisor: [
    'dashboard.view',
    'calls.view',
    'calls.spy',
    'recordings.view',
    'recordings.download',
    'extensions.view',
    'trunks.view',
    'ivr.view',
    'queues.view',
    'campaigns.view',
    'campaigns.manage',
    'campaigns.start_stop',
    'contacts.view',
    'contacts.manage',
    'contacts.import',
    'contacts.export',
    'prompts.view',
    'routing.view',
    'ring_groups.view',
    'analytics.view',
  ],
  viewer: [
    'dashboard.view',
    'calls.view',
    'recordings.view',
    'extensions.view',
    'trunks.view',
    'ivr.view',
    'queues.view',
    'campaigns.view',
    'contacts.view',
    'prompts.view',
    'routing.view',
    'ring_groups.view',
    'analytics.view',
  ],
};

export interface UserPermission {
  id: number;
  userId: number;
  permission: Permission;
  granted: boolean;
  createdAt: number;
}

interface UserPermissionRow {
  id: number;
  user_id: number;
  permission: string;
  granted: boolean;
  created_at: Date | string | number;
}

function rowToUserPermission(row: UserPermissionRow): UserPermission {
  return {
    id: row.id,
    userId: row.user_id,
    permission: row.permission as Permission,
    granted: row.granted,
    createdAt: typeof row.created_at === 'object' ? Math.floor(new Date(row.created_at).getTime() / 1000) :
      typeof row.created_at === 'string' ? Math.floor(new Date(row.created_at).getTime() / 1000) : row.created_at,
  };
}

export class PermissionRepository {
  constructor(private db: DatabaseManager) { }

  /**
   * Get all permissions for a user
   */
  async findByUserId(userId: number): Promise<UserPermission[]> {
    const rows = await this.db.all<UserPermissionRow>(
      'SELECT * FROM user_permissions WHERE user_id = $1',
      [userId]
    );
    return rows.map(rowToUserPermission);
  }

  /**
   * Get effective permissions for a user (considering role defaults)
   * Returns a Set of granted permissions
   */
  async getEffectivePermissions(userId: number, userRole: string): Promise<Set<Permission>> {
    // Start with role defaults
    const rolePermissions = ROLE_DEFAULT_PERMISSIONS[userRole] || [];
    const effectivePermissions = new Set<Permission>(rolePermissions);

    // Get user-specific overrides
    const userPermissions = await this.findByUserId(userId);

    for (const perm of userPermissions) {
      if (perm.granted) {
        effectivePermissions.add(perm.permission);
      } else {
        effectivePermissions.delete(perm.permission);
      }
    }

    return effectivePermissions;
  }

  /**
   * Check if user has a specific permission
   */
  async hasPermission(userId: number, userRole: string, permission: Permission): Promise<boolean> {
    // Admin always has all permissions
    if (userRole === 'admin') return true;

    const effectivePermissions = await this.getEffectivePermissions(userId, userRole);
    return effectivePermissions.has(permission);
  }

  /**
   * Set a permission for a user (grant or revoke)
   */
  async setPermission(userId: number, permission: Permission, granted: boolean): Promise<void> {
    // Check if permission override already exists
    const existing = await this.db.get<UserPermissionRow>(
      'SELECT * FROM user_permissions WHERE user_id = $1 AND permission = $2',
      [userId, permission]
    );

    if (existing) {
      // Update existing
      await this.db.run(
        'UPDATE user_permissions SET granted = $1 WHERE user_id = $2 AND permission = $3',
        [granted, userId, permission]
      );
    } else {
      // Insert new
      await this.db.run(
        'INSERT INTO user_permissions (user_id, permission, granted) VALUES ($1, $2, $3)',
        [userId, permission, granted]
      );
    }

    dbLogger.info(`Permission ${permission} ${granted ? 'granted to' : 'revoked from'} user ${userId}`);
  }

  /**
   * Set multiple permissions at once
   */
  async setPermissions(userId: number, permissions: { permission: Permission; granted: boolean }[]): Promise<void> {
    await this.db.transaction(async () => {
      for (const { permission, granted } of permissions) {
        await this.setPermission(userId, permission, granted);
      }
    });
  }

  /**
   * Remove all custom permission overrides for a user (revert to role defaults)
   */
  async clearUserPermissions(userId: number): Promise<void> {
    await this.db.run('DELETE FROM user_permissions WHERE user_id = $1', [userId]);
    dbLogger.info(`Cleared all permission overrides for user ${userId}`);
  }

  /**
   * Initialize permissions for a new user based on their role
   * (Only needed if you want to explicitly store role defaults)
   */
  async initializeForUser(userId: number, role: string): Promise<void> {
    // By default, we don't store role defaults - they're computed
    // But this can be used to pre-populate if needed
    dbLogger.info(`Permissions initialized for user ${userId} with role ${role}`);
  }

  /**
   * Get all permissions with their granted status for a user (for UI display)
   */
  async getAllPermissionsForUser(userId: number, userRole: string): Promise<{ permission: Permission; granted: boolean; isOverride: boolean }[]> {
    const effectivePermissions = await this.getEffectivePermissions(userId, userRole);
    const userOverrides = new Map(
      (await this.findByUserId(userId)).map(p => [p.permission, p.granted])
    );

    return ALL_PERMISSIONS.map(permission => ({
      permission,
      granted: effectivePermissions.has(permission),
      isOverride: userOverrides.has(permission),
    }));
  }
}
