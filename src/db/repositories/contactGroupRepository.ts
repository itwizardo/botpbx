import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database';
import { dbLogger } from '../../utils/logger';

export interface ContactGroup {
  id: string;
  name: string;
  description: string | null;
  allowRedial: boolean; // If true, numbers can be called again (not added to DNC)
  createdAt: number;
  // Stats (computed)
  totalMembers?: number;
  calledCount?: number;
  uncalledCount?: number;
}

export interface ContactGroupMember {
  id: string;
  groupId: string;
  phoneNumber: string;
  name: string | null;
  calledAt: number | null;
  campaignId: string | null;
  createdAt: number;
}

export interface GlobalDNC {
  phoneNumber: string;
  firstCalledAt: number;
  lastCalledAt: number;
  callCount: number;
  lastCampaignId: string | null;
  notes: string | null;
}

interface ContactGroupRow {
  id: string;
  name: string;
  description: string | null;
  allow_redial: number;
  created_at: number;
}

interface ContactGroupMemberRow {
  id: string;
  group_id: string;
  phone_number: string;
  name: string | null;
  called_at: number | null;
  campaign_id: string | null;
  created_at: number;
}

interface GlobalDNCRow {
  phone_number: string;
  first_called_at: number;
  last_called_at: number;
  call_count: number;
  last_campaign_id: string | null;
  notes: string | null;
}

function rowToContactGroup(row: ContactGroupRow): ContactGroup {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    allowRedial: !!row.allow_redial,
    createdAt: row.created_at,
  };
}

function rowToMember(row: ContactGroupMemberRow): ContactGroupMember {
  return {
    id: row.id,
    groupId: row.group_id,
    phoneNumber: row.phone_number,
    name: row.name,
    calledAt: row.called_at,
    campaignId: row.campaign_id,
    createdAt: row.created_at,
  };
}

function rowToGlobalDNC(row: GlobalDNCRow): GlobalDNC {
  return {
    phoneNumber: row.phone_number,
    firstCalledAt: row.first_called_at,
    lastCalledAt: row.last_called_at,
    callCount: row.call_count,
    lastCampaignId: row.last_campaign_id,
    notes: row.notes,
  };
}

export class ContactGroupRepository {
  constructor(private db: DatabaseManager) {}

  // ============ Contact Groups ============

  async createGroup(data: { name: string; description?: string; allowRedial?: boolean }): Promise<ContactGroup> {
    const id = uuidv4();
    await this.db.run(
      `INSERT INTO contact_groups (id, name, description, allow_redial) VALUES ($1, $2, $3, $4)`,
      [id, data.name, data.description || null, data.allowRedial ?? false]
    );
    const group = await this.findGroupById(id);
    if (!group) throw new Error('Failed to create contact group');
    dbLogger.info(`Contact group created: ${data.name} (allowRedial: ${data.allowRedial || false})`);
    return group;
  }

  async findGroupById(id: string): Promise<ContactGroup | null> {
    const row = await this.db.get<ContactGroupRow>(
      'SELECT * FROM contact_groups WHERE id = $1',
      [id]
    );
    if (!row) return null;
    const group = rowToContactGroup(row);
    // Add stats
    const stats = await this.getGroupStats(id);
    return { ...group, ...stats };
  }

  async findGroupByName(name: string): Promise<ContactGroup | null> {
    const row = await this.db.get<ContactGroupRow>(
      'SELECT * FROM contact_groups WHERE name = $1',
      [name]
    );
    return row ? rowToContactGroup(row) : null;
  }

  async findAllGroups(): Promise<ContactGroup[]> {
    const rows = await this.db.all<ContactGroupRow>(
      'SELECT * FROM contact_groups ORDER BY created_at DESC'
    );
    const groups = rows.map(rowToContactGroup);
    // Add stats to each group
    for (const group of groups) {
      const stats = await this.getGroupStats(group.id);
      Object.assign(group, stats);
    }
    return groups;
  }

  async updateGroup(id: string, data: { name?: string; description?: string; allowRedial?: boolean }): Promise<boolean> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.allowRedial !== undefined) {
      fields.push(`allow_redial = $${paramIndex++}`);
      values.push(!!data.allowRedial);
    }

    if (fields.length === 0) return false;

    values.push(id);
    const result = await this.db.run(
      `UPDATE contact_groups SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
    return result.rowCount > 0;
  }

  async deleteGroup(id: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM contact_groups WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  async getGroupStats(groupId: string): Promise<{ totalMembers: number; calledCount: number; uncalledCount: number }> {
    const totalResult = await this.db.get<{ count: string }>(
      'SELECT COUNT(*) as count FROM contact_group_members WHERE group_id = $1',
      [groupId]
    );
    const calledResult = await this.db.get<{ count: string }>(
      'SELECT COUNT(*) as count FROM contact_group_members WHERE group_id = $1 AND called_at IS NOT NULL',
      [groupId]
    );

    const totalMembers = totalResult ? parseInt(totalResult.count, 10) : 0;
    const calledCount = calledResult ? parseInt(calledResult.count, 10) : 0;

    return {
      totalMembers,
      calledCount,
      uncalledCount: totalMembers - calledCount,
    };
  }

  // ============ Group Members ============

  async addMember(data: { groupId: string; phoneNumber: string; name?: string }): Promise<ContactGroupMember> {
    const id = uuidv4();
    // Normalize phone number
    const normalizedPhone = this.normalizePhone(data.phoneNumber);

    // Check if already in global DNC
    const dncEntry = await this.findGlobalDNC(normalizedPhone);

    await this.db.run(
      `INSERT INTO contact_group_members (id, group_id, phone_number, name, called_at, campaign_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        data.groupId,
        normalizedPhone,
        data.name || null,
        dncEntry ? dncEntry.lastCalledAt : null, // Pre-fill if already called
        dncEntry ? dncEntry.lastCampaignId : null,
      ]
    );

    const member = await this.findMemberById(id);
    if (!member) throw new Error('Failed to add member');
    return member;
  }

  async addMembersBulk(groupId: string, members: Array<{ phoneNumber: string; name?: string }>): Promise<{ added: number; skipped: number }> {
    let added = 0;
    let skipped = 0;

    for (const member of members) {
      try {
        const normalizedPhone = this.normalizePhone(member.phoneNumber);

        // Check if already exists in group
        const existing = await this.db.get<{ id: string }>(
          'SELECT id FROM contact_group_members WHERE group_id = $1 AND phone_number = $2',
          [groupId, normalizedPhone]
        );

        if (existing) {
          skipped++;
          continue;
        }

        await this.addMember({
          groupId,
          phoneNumber: normalizedPhone,
          name: member.name,
        });
        added++;
      } catch (error) {
        skipped++;
      }
    }

    return { added, skipped };
  }

  async findMemberById(id: string): Promise<ContactGroupMember | null> {
    const row = await this.db.get<ContactGroupMemberRow>(
      'SELECT * FROM contact_group_members WHERE id = $1',
      [id]
    );
    return row ? rowToMember(row) : null;
  }

  async findMembersByGroup(groupId: string, options?: {
    calledOnly?: boolean;
    uncalledOnly?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<ContactGroupMember[]> {
    let query = 'SELECT * FROM contact_group_members WHERE group_id = $1';
    const params: unknown[] = [groupId];

    if (options?.calledOnly) {
      query += ' AND called_at IS NOT NULL';
    } else if (options?.uncalledOnly) {
      query += ' AND called_at IS NULL';
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ` LIMIT ${options.limit}`;
      if (options?.offset) {
        query += ` OFFSET ${options.offset}`;
      }
    }

    const rows = await this.db.all<ContactGroupMemberRow>(query, params);
    return rows.map(rowToMember);
  }

  async removeMember(id: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM contact_group_members WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  async clearGroupMembers(groupId: string): Promise<number> {
    const result = await this.db.run('DELETE FROM contact_group_members WHERE group_id = $1', [groupId]);
    return result.rowCount;
  }

  // ============ Global DNC ============

  async markAsCalled(phoneNumber: string, campaignId?: string): Promise<void> {
    const normalizedPhone = this.normalizePhone(phoneNumber);
    const now = Math.floor(Date.now() / 1000);

    // Update or insert into global DNC
    await this.db.run(
      `INSERT INTO global_dnc (phone_number, first_called_at, last_called_at, call_count, last_campaign_id)
       VALUES ($1, $2, $2, 1, $3)
       ON CONFLICT(phone_number) DO UPDATE SET
         last_called_at = $2,
         call_count = global_dnc.call_count + 1,
         last_campaign_id = $3`,
      [normalizedPhone, now, campaignId || null]
    );

    // Update all group members with this phone number
    await this.db.run(
      `UPDATE contact_group_members
       SET called_at = $1, campaign_id = $2
       WHERE phone_number = $3 AND called_at IS NULL`,
      [now, campaignId || null, normalizedPhone]
    );

    dbLogger.info(`Number marked as called: ${normalizedPhone}`);
  }

  async findGlobalDNC(phoneNumber: string): Promise<GlobalDNC | null> {
    const normalizedPhone = this.normalizePhone(phoneNumber);
    const row = await this.db.get<GlobalDNCRow>(
      'SELECT * FROM global_dnc WHERE phone_number = $1',
      [normalizedPhone]
    );
    return row ? rowToGlobalDNC(row) : null;
  }

  async isNumberCalled(phoneNumber: string): Promise<boolean> {
    const dncEntry = await this.findGlobalDNC(phoneNumber);
    return dncEntry !== null;
  }

  async getGlobalDNCList(options?: { limit?: number; offset?: number }): Promise<GlobalDNC[]> {
    let query = 'SELECT * FROM global_dnc ORDER BY last_called_at DESC';

    if (options?.limit) {
      query += ` LIMIT ${options.limit}`;
      if (options?.offset) {
        query += ` OFFSET ${options.offset}`;
      }
    }

    const rows = await this.db.all<GlobalDNCRow>(query);
    return rows.map(rowToGlobalDNC);
  }

  async getGlobalDNCCount(): Promise<number> {
    const result = await this.db.get<{ count: string }>(
      'SELECT COUNT(*) as count FROM global_dnc'
    );
    return result ? parseInt(result.count, 10) : 0;
  }

  async removeFromGlobalDNC(phoneNumber: string): Promise<boolean> {
    const normalizedPhone = this.normalizePhone(phoneNumber);

    // Remove from global DNC
    const result = await this.db.run('DELETE FROM global_dnc WHERE phone_number = $1', [normalizedPhone]);

    // Reset called status in all groups
    await this.db.run(
      'UPDATE contact_group_members SET called_at = NULL, campaign_id = NULL WHERE phone_number = $1',
      [normalizedPhone]
    );

    return result.rowCount > 0;
  }

  async clearGlobalDNC(): Promise<number> {
    // Clear all global DNC entries
    const result = await this.db.run('DELETE FROM global_dnc');

    // Reset all group members called status
    await this.db.run('UPDATE contact_group_members SET called_at = NULL, campaign_id = NULL');

    return result.rowCount;
  }

  // ============ Utility ============

  async isNumberInRedialGroup(phoneNumber: string): Promise<boolean> {
    const normalizedPhone = this.normalizePhone(phoneNumber);
    // Check if this number is in any group that allows redial
    const result = await this.db.get<{ count: string }>(
      `SELECT COUNT(*) as count FROM contact_group_members cgm
       JOIN contact_groups cg ON cgm.group_id = cg.id
       WHERE cgm.phone_number = $1 AND cg.allow_redial = true`,
      [normalizedPhone]
    );
    return result ? parseInt(result.count, 10) > 0 : false;
  }

  private normalizePhone(phone: string): string {
    // Remove all non-digit characters except leading +
    let normalized = phone.replace(/[^\d+]/g, '');
    // If starts with +, keep it, otherwise just digits
    if (!normalized.startsWith('+')) {
      normalized = normalized.replace(/\D/g, '');
    }
    return normalized;
  }

  async getUncalledNumbersFromGroup(groupId: string): Promise<string[]> {
    const rows = await this.db.all<{ phone_number: string }>(
      'SELECT phone_number FROM contact_group_members WHERE group_id = $1 AND called_at IS NULL',
      [groupId]
    );
    return rows.map(r => r.phone_number);
  }

  async exportGroupToCampaign(groupId: string, uncalledOnly: boolean = true): Promise<Array<{ phoneNumber: string; name?: string }>> {
    const members = await this.findMembersByGroup(groupId, { uncalledOnly });
    return members.map(m => ({
      phoneNumber: m.phoneNumber,
      name: m.name || undefined,
    }));
  }
}
