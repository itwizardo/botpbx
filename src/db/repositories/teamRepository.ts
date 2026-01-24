import { DatabaseManager } from '../database';
import { dbLogger } from '../../utils/logger';

export interface Team {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  queueId: string | null;
  queueName?: string | null;
  tenantId: string;
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: number;
  role: string;
  joinedAt: string;
  // User info (from join)
  username?: string;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  userRole?: string;
  avatarUrl?: string | null;
  enabled?: boolean;
  lastLoginAt?: number | null;
}

export interface TeamWithMembers extends Team {
  members: TeamMember[];
}

interface TeamRow {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  queue_id: string | null;
  queue_name?: string | null;
  tenant_id: string;
  member_count?: string;
  created_at: string;
  updated_at: string;
}

interface TeamMemberRow {
  id: string;
  team_id: string;
  user_id: number;
  role: string;
  joined_at: string;
  username?: string;
  display_name?: string | null;
  email?: string | null;
  phone?: string | null;
  user_role?: string;
  avatar_url?: string | null;
  enabled?: boolean;
  last_login_at?: string | null;
}

function rowToTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    queueId: row.queue_id,
    queueName: row.queue_name,
    tenantId: row.tenant_id,
    memberCount: row.member_count ? parseInt(row.member_count, 10) : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMember(row: TeamMemberRow): TeamMember {
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    role: row.role,
    joinedAt: row.joined_at,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
    userRole: row.user_role,
    avatarUrl: row.avatar_url,
    enabled: row.enabled,
    lastLoginAt: row.last_login_at ? Math.floor(new Date(row.last_login_at).getTime() / 1000) : null,
  };
}

export class TeamRepository {
  constructor(private db: DatabaseManager) {}

  async create(data: {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    queueId?: string;
    tenantId?: string;
  }): Promise<Team> {
    const result = await this.db.get<TeamRow>(
      `INSERT INTO teams (name, description, color, icon, queue_id, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.name,
        data.description || null,
        data.color || 'blue',
        data.icon || 'users',
        data.queueId || null,
        data.tenantId || 'default',
      ]
    );

    if (!result) throw new Error('Failed to create team');
    dbLogger.info(`Team created: ${data.name}`);
    return rowToTeam(result);
  }

  async findById(id: string): Promise<Team | null> {
    const row = await this.db.get<TeamRow>(
      `SELECT t.*, q.name as queue_name,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
       FROM teams t
       LEFT JOIN queues q ON t.queue_id = q.id
       WHERE t.id = $1`,
      [id]
    );
    return row ? rowToTeam(row) : null;
  }

  async findAll(tenantId: string = 'default'): Promise<Team[]> {
    const rows = await this.db.all<TeamRow>(
      `SELECT t.*, q.name as queue_name,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
       FROM teams t
       LEFT JOIN queues q ON t.queue_id = q.id
       WHERE t.tenant_id = $1
       ORDER BY t.name ASC`,
      [tenantId]
    );
    return rows.map(rowToTeam);
  }

  async findAllWithMembers(tenantId: string = 'default'): Promise<TeamWithMembers[]> {
    const teams = await this.findAll(tenantId);
    const teamsWithMembers: TeamWithMembers[] = [];

    for (const team of teams) {
      const members = await this.getMembers(team.id);
      teamsWithMembers.push({ ...team, members });
    }

    return teamsWithMembers;
  }

  async update(id: string, updates: {
    name?: string;
    description?: string | null;
    color?: string;
    icon?: string;
    queueId?: string | null;
  }): Promise<boolean> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.color !== undefined) {
      fields.push(`color = $${paramIndex++}`);
      values.push(updates.color);
    }
    if (updates.icon !== undefined) {
      fields.push(`icon = $${paramIndex++}`);
      values.push(updates.icon);
    }
    if (updates.queueId !== undefined) {
      fields.push(`queue_id = $${paramIndex++}`);
      values.push(updates.queueId);
    }

    if (fields.length === 0) return false;

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await this.db.run(
      `UPDATE teams SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    return result.rowCount > 0;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM teams WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  // Team Members
  async addMember(teamId: string, userId: number, role: string = 'member'): Promise<TeamMember> {
    const result = await this.db.get<TeamMemberRow>(
      `INSERT INTO team_members (team_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (team_id, user_id) DO UPDATE SET role = $3
       RETURNING *`,
      [teamId, userId, role]
    );

    if (!result) throw new Error('Failed to add member to team');
    dbLogger.info(`User ${userId} added to team ${teamId}`);
    return rowToMember(result);
  }

  async removeMember(teamId: string, userId: number): Promise<boolean> {
    const result = await this.db.run(
      'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2',
      [teamId, userId]
    );
    return result.rowCount > 0;
  }

  async getMembers(teamId: string): Promise<TeamMember[]> {
    const rows = await this.db.all<TeamMemberRow>(
      `SELECT tm.*, u.username, u.display_name, u.email, u.phone,
              u.role as user_role, u.avatar_url, u.enabled, u.last_login_at
       FROM team_members tm
       JOIN web_users u ON tm.user_id = u.id
       WHERE tm.team_id = $1
       ORDER BY u.display_name ASC, u.username ASC`,
      [teamId]
    );
    return rows.map(rowToMember);
  }

  async getUserTeams(userId: number): Promise<Team[]> {
    const rows = await this.db.all<TeamRow>(
      `SELECT t.*, q.name as queue_name,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
       FROM teams t
       LEFT JOIN queues q ON t.queue_id = q.id
       JOIN team_members tm ON t.id = tm.team_id
       WHERE tm.user_id = $1
       ORDER BY t.name ASC`,
      [userId]
    );
    return rows.map(rowToTeam);
  }

  async getUnassignedUsers(tenantId: string = 'default'): Promise<TeamMember[]> {
    const rows = await this.db.all<TeamMemberRow>(
      `SELECT
         gen_random_uuid()::text as id,
         NULL as team_id,
         u.id as user_id,
         'unassigned' as role,
         u.created_at as joined_at,
         u.username, u.display_name, u.email, u.phone,
         u.role as user_role, u.avatar_url, u.enabled, u.last_login_at
       FROM web_users u
       WHERE NOT EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = u.id)
       ORDER BY u.display_name ASC, u.username ASC`
    );
    return rows.map(rowToMember);
  }

  async count(tenantId: string = 'default'): Promise<number> {
    const result = await this.db.get<{ count: string }>(
      'SELECT COUNT(*) as count FROM teams WHERE tenant_id = $1',
      [tenantId]
    );
    return result ? parseInt(result.count, 10) : 0;
  }

  async getStats(tenantId: string = 'default'): Promise<{
    totalTeams: number;
    totalUsers: number;
    activeUsers: number;
    adminCount: number;
    supervisorCount: number;
    viewerCount: number;
    unassignedCount: number;
  }> {
    const [teamsResult, usersResult, activeResult, rolesResult, unassignedResult] = await Promise.all([
      this.db.get<{ count: string }>('SELECT COUNT(*) as count FROM teams WHERE tenant_id = $1', [tenantId]),
      this.db.get<{ count: string }>('SELECT COUNT(*) as count FROM web_users'),
      this.db.get<{ count: string }>(
        `SELECT COUNT(*) as count FROM web_users WHERE enabled = true AND last_login_at > NOW() - INTERVAL '24 hours'`
      ),
      this.db.all<{ role: string; count: string }>(
        `SELECT role, COUNT(*) as count FROM web_users GROUP BY role`
      ),
      this.db.get<{ count: string }>(
        `SELECT COUNT(*) as count FROM web_users u WHERE NOT EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = u.id)`
      ),
    ]);

    const roleCounts = rolesResult.reduce((acc, r) => {
      acc[r.role] = parseInt(r.count, 10);
      return acc;
    }, {} as Record<string, number>);

    return {
      totalTeams: teamsResult ? parseInt(teamsResult.count, 10) : 0,
      totalUsers: usersResult ? parseInt(usersResult.count, 10) : 0,
      activeUsers: activeResult ? parseInt(activeResult.count, 10) : 0,
      adminCount: roleCounts['admin'] || 0,
      supervisorCount: roleCounts['supervisor'] || 0,
      viewerCount: roleCounts['viewer'] || 0,
      unassignedCount: unassignedResult ? parseInt(unassignedResult.count, 10) : 0,
    };
  }
}
