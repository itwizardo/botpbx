import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database';
import { CampaignContact, ContactStatus } from '../../models/types';
import { dbLogger } from '../../utils/logger';

interface ContactRow {
  id: string;
  campaign_id: string;
  phone_number: string;
  name: string | null;
  status: string;
  attempts: number;
  last_attempt_at: Date | string | number | null;
  answered_at: Date | string | number | null;
  call_log_id: string | null;
  notes: string | null;
  amd_detected: boolean;
  amd_status: string | null;
  created_at: Date | string | number;
}

function timestampToNumber(value: Date | string | number | null): number | null {
  if (value === null) return null;
  if (typeof value === 'object') return Math.floor(new Date(value).getTime() / 1000);
  if (typeof value === 'string') return Math.floor(new Date(value).getTime() / 1000);
  return value;
}

function rowToContact(row: ContactRow): CampaignContact {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    phoneNumber: row.phone_number,
    name: row.name,
    status: row.status as ContactStatus,
    attempts: row.attempts,
    lastAttemptAt: timestampToNumber(row.last_attempt_at),
    answeredAt: timestampToNumber(row.answered_at),
    callLogId: row.call_log_id,
    notes: row.notes,
    amdDetected: row.amd_detected || false,
    amdStatus: row.amd_status,
    createdAt: timestampToNumber(row.created_at) || 0,
  };
}

export interface ContactInput {
  phoneNumber: string;
  name?: string;
}

export interface ContactStatusCounts {
  pending: number;
  dialing: number;
  answered: number;
  press1: number;
  connected: number;
  no_answer: number;
  busy: number;
  failed: number;
  dnc: number;
  answering_machine: number;
  total: number;
}

export class CampaignContactRepository {
  constructor(private db: DatabaseManager) {}

  /**
   * Create a single contact
   */
  async create(campaignId: string, contact: ContactInput): Promise<CampaignContact> {
    const id = uuidv4();
    const createdAt = Math.floor(Date.now() / 1000);

    await this.db.run(
      `INSERT INTO campaign_contacts (id, campaign_id, phone_number, name, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, campaignId, contact.phoneNumber, contact.name || null, createdAt]
    );

    return {
      id,
      campaignId,
      phoneNumber: contact.phoneNumber,
      name: contact.name || null,
      status: 'pending',
      attempts: 0,
      lastAttemptAt: null,
      answeredAt: null,
      callLogId: null,
      notes: null,
      amdDetected: false,
      amdStatus: null,
      createdAt,
    };
  }

  /**
   * Bulk create contacts for a campaign
   */
  async bulkCreate(campaignId: string, contacts: ContactInput[]): Promise<number> {
    let created = 0;

    // Use a transaction for better performance
    await this.db.transaction(async () => {
      for (const contact of contacts) {
        const id = uuidv4();
        const createdAt = Math.floor(Date.now() / 1000);
        await this.db.run(
          `INSERT INTO campaign_contacts (id, campaign_id, phone_number, name, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, campaignId, contact.phoneNumber, contact.name || null, createdAt]
        );
        created++;
      }
    });

    dbLogger.info(`Bulk created ${created} contacts for campaign ${campaignId}`);
    return created;
  }

  /**
   * Find contact by ID
   */
  async findById(id: string): Promise<CampaignContact | null> {
    const row = await this.db.get<ContactRow>('SELECT * FROM campaign_contacts WHERE id = $1', [id]);
    return row ? rowToContact(row) : null;
  }

  /**
   * Find all contacts for a campaign
   * WARNING: For large campaigns, use findByCampaignPaginated instead
   */
  async findByCampaign(campaignId: string): Promise<CampaignContact[]> {
    const rows = await this.db.all<ContactRow>(
      'SELECT * FROM campaign_contacts WHERE campaign_id = $1 ORDER BY created_at ASC',
      [campaignId]
    );
    return rows.map(rowToContact);
  }

  /**
   * Find contacts for a campaign with pagination (SQL LIMIT/OFFSET)
   * Use this for displaying contacts in UI to avoid OOM with large campaigns
   */
  async findByCampaignPaginated(
    campaignId: string,
    options: { status?: string; limit: number; offset: number }
  ): Promise<{ contacts: CampaignContact[]; total: number }> {
    const { status, limit, offset } = options;

    // Build query with optional status filter
    let whereClause = 'WHERE campaign_id = $1';
    const params: unknown[] = [campaignId];

    if (status) {
      whereClause += ' AND status = $2';
      params.push(status);
    }

    // Get total count
    const countResult = await this.db.get<{ count: string }>(
      `SELECT COUNT(*) as count FROM campaign_contacts ${whereClause}`,
      params
    );
    const total = countResult ? parseInt(countResult.count, 10) : 0;

    // Get paginated results
    const queryParams = [...params, limit, offset];
    const rows = await this.db.all<ContactRow>(
      `SELECT * FROM campaign_contacts ${whereClause}
       ORDER BY created_at ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      queryParams
    );

    return {
      contacts: rows.map(rowToContact),
      total,
    };
  }

  /**
   * Find pending contacts for dialing (respects retry logic)
   */
  async findPendingForDialing(campaignId: string, limit: number, retryDelayMinutes: number, maxAttempts: number): Promise<CampaignContact[]> {
    const retryDelaySecs = retryDelayMinutes * 60;

    // Get contacts that are:
    // 1. Status is 'pending' (never tried), OR
    // 2. Status is 'no_answer'/'busy' AND attempts < maxAttempts AND last_attempt_at + delay < now
    const rows = await this.db.all<ContactRow>(
      `SELECT * FROM campaign_contacts
       WHERE campaign_id = $1
       AND (
         status = 'pending'
         OR (
           status IN ('no_answer', 'busy')
           AND attempts < $2
           AND (last_attempt_at IS NULL OR last_attempt_at + INTERVAL '${retryDelaySecs} seconds' < NOW())
         )
       )
       ORDER BY attempts ASC, created_at ASC
       LIMIT $3`,
      [campaignId, maxAttempts, limit]
    );

    return rows.map(rowToContact);
  }

  /**
   * Find contacts currently being dialed
   */
  async findDialing(campaignId: string): Promise<CampaignContact[]> {
    const rows = await this.db.all<ContactRow>(
      'SELECT * FROM campaign_contacts WHERE campaign_id = $1 AND status = $2',
      [campaignId, 'dialing']
    );
    return rows.map(rowToContact);
  }

  /**
   * Update contact status
   */
  async updateStatus(id: string, status: ContactStatus, callLogId?: string): Promise<boolean> {
    const updates: string[] = ['status = $1'];
    const values: unknown[] = [status];
    let paramIndex = 2;

    if (status === 'dialing') {
      updates.push('attempts = attempts + 1');
      updates.push('last_attempt_at = NOW()');
    }

    if (status === 'answered' || status === 'press1' || status === 'connected') {
      updates.push('answered_at = NOW()');
    }

    if (callLogId) {
      updates.push(`call_log_id = $${paramIndex++}`);
      values.push(callLogId);
    }

    values.push(id);
    const result = await this.db.run(
      `UPDATE campaign_contacts SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    return result.rowCount > 0;
  }

  /**
   * Update AMD detection status on a contact
   */
  async updateAmdStatus(id: string, amdStatus: string, detected: boolean): Promise<boolean> {
    const result = await this.db.run(
      'UPDATE campaign_contacts SET amd_detected = $1, amd_status = $2, status = $3 WHERE id = $4',
      [detected ? 1 : 0, amdStatus, detected ? 'answering_machine' : 'answered', id]
    );
    return result.rowCount > 0;
  }

  /**
   * Mark contact as Do Not Call
   */
  async markDNC(id: string, notes?: string): Promise<boolean> {
    const result = await this.db.run(
      'UPDATE campaign_contacts SET status = $1, notes = $2 WHERE id = $3',
      ['dnc', notes || 'Marked as Do Not Call', id]
    );
    return result.rowCount > 0;
  }

  /**
   * Reset stuck 'dialing' contacts back to pending (for campaign restart)
   */
  async resetDialingToPending(campaignId: string): Promise<number> {
    const result = await this.db.run(
      `UPDATE campaign_contacts SET status = 'pending' WHERE campaign_id = $1 AND status = 'dialing'`,
      [campaignId]
    );
    return result.rowCount;
  }

  /**
   * Reset ALL contacts back to pending (for re-running campaign)
   * This resets answered, press1, connected, etc. back to pending
   */
  async resetAllToPending(campaignId: string): Promise<number> {
    const result = await this.db.run(
      `UPDATE campaign_contacts SET status = 'pending', attempts = 0 WHERE campaign_id = $1 AND status != 'dnc'`,
      [campaignId]
    );
    return result.rowCount;
  }

  /**
   * Get status counts for a campaign
   */
  async countByStatus(campaignId: string): Promise<ContactStatusCounts> {
    const rows = await this.db.all<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count FROM campaign_contacts WHERE campaign_id = $1 GROUP BY status`,
      [campaignId]
    );

    const counts: ContactStatusCounts = {
      pending: 0,
      dialing: 0,
      answered: 0,
      press1: 0,
      connected: 0,
      no_answer: 0,
      busy: 0,
      failed: 0,
      dnc: 0,
      answering_machine: 0,
      total: 0,
    };

    for (const row of rows) {
      const count = parseInt(row.count, 10);
      if (row.status in counts) {
        counts[row.status as keyof ContactStatusCounts] = count;
      }
      counts.total += count;
    }

    return counts;
  }

  /**
   * Count total contacts for a campaign
   */
  async countByCampaign(campaignId: string): Promise<number> {
    const result = await this.db.get<{ count: string }>(
      'SELECT COUNT(*) as count FROM campaign_contacts WHERE campaign_id = $1',
      [campaignId]
    );
    return result ? parseInt(result.count, 10) : 0;
  }

  /**
   * Check if campaign has any remaining contacts to dial
   */
  async hasRemainingContacts(campaignId: string, maxAttempts: number): Promise<boolean> {
    const result = await this.db.get<{ count: string }>(
      `SELECT COUNT(*) as count FROM campaign_contacts
       WHERE campaign_id = $1
       AND (status = 'pending' OR (status IN ('no_answer', 'busy') AND attempts < $2))`,
      [campaignId, maxAttempts]
    );
    return result ? parseInt(result.count, 10) > 0 : false;
  }

  /**
   * Delete all contacts for a campaign
   */
  async deleteByCampaign(campaignId: string): Promise<number> {
    const result = await this.db.run(
      'DELETE FROM campaign_contacts WHERE campaign_id = $1',
      [campaignId]
    );
    return result.rowCount;
  }

  /**
   * Delete a single contact
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM campaign_contacts WHERE id = $1', [id]);
    return result.rowCount > 0;
  }
}
