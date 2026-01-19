import { DatabaseManager } from '../database';
import { dbLogger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface Contact {
  id: string;
  phoneNumber: string;
  name: string | null;
  email: string | null;
  company: string | null;
  notes: string | null;
  tags: string | null;
  status: 'active' | 'dnc' | 'invalid' | 'archived';
  createdAt: number;
  updatedAt: number;
  customFields?: Record<string, string>;
}

interface ContactRow {
  id: string;
  phone_number: string;
  name: string | null;
  email: string | null;
  company: string | null;
  notes: string | null;
  tags: string | null;
  status: string;
  tenant_id: string;
  created_at: Date | string | number;
  updated_at: Date | string | number;
}

interface ContactFieldRow {
  id: string;
  contact_id: string;
  field_name: string;
  field_value: string | null;
}

function rowToContact(row: ContactRow): Contact & { tenantId: string } {
  return {
    id: row.id,
    phoneNumber: row.phone_number,
    name: row.name,
    email: row.email,
    company: row.company,
    notes: row.notes,
    tags: row.tags,
    status: row.status as Contact['status'],
    tenantId: row.tenant_id,
    createdAt: typeof row.created_at === 'object' ? Math.floor(new Date(row.created_at).getTime() / 1000) :
               typeof row.created_at === 'string' ? Math.floor(new Date(row.created_at).getTime() / 1000) : row.created_at,
    updatedAt: typeof row.updated_at === 'object' ? Math.floor(new Date(row.updated_at).getTime() / 1000) :
               typeof row.updated_at === 'string' ? Math.floor(new Date(row.updated_at).getTime() / 1000) : row.updated_at,
  };
}

export interface ContactFilter {
  status?: Contact['status'];
  tag?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ImportResult {
  total: number;
  imported: number;
  duplicates: number;
  errors: number;
  errorDetails: string[];
}

export class ContactRepository {
  constructor(private db: DatabaseManager) {}

  async create(contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt' | 'customFields'>, tenantId: string = 'default'): Promise<Contact & { tenantId: string }> {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    await this.db.run(
      `INSERT INTO contacts (id, phone_number, name, email, company, notes, tags, status, tenant_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
      [
        id,
        contact.phoneNumber,
        contact.name,
        contact.email,
        contact.company,
        contact.notes,
        contact.tags,
        contact.status,
        tenantId,
      ]
    );

    dbLogger.info(`Contact created: ${contact.phoneNumber} (${id}) for tenant ${tenantId}`);

    return {
      id,
      ...contact,
      tenantId,
      createdAt: now,
      updatedAt: now,
    };
  }

  async findById(id: string, tenantId?: string): Promise<(Contact & { tenantId: string }) | null> {
    let query = 'SELECT * FROM contacts WHERE id = $1';
    const params: unknown[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const row = await this.db.get<ContactRow>(query, params);
    if (!row) return null;

    const contact = rowToContact(row);
    contact.customFields = await this.getCustomFields(id);
    return contact;
  }

  async findByPhone(phoneNumber: string, tenantId?: string): Promise<(Contact & { tenantId: string }) | null> {
    let query = 'SELECT * FROM contacts WHERE phone_number = $1';
    const params: unknown[] = [phoneNumber];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const row = await this.db.get<ContactRow>(query, params);
    if (!row) return null;

    return rowToContact(row);
  }

  async findAll(filter: ContactFilter = {}, tenantId?: string): Promise<{ contacts: (Contact & { tenantId: string })[]; total: number }> {
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (tenantId) {
      whereClause += ` AND tenant_id = $${paramIndex++}`;
      params.push(tenantId);
    }

    if (filter.status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(filter.status);
    }

    if (filter.tag) {
      whereClause += ` AND tags LIKE $${paramIndex++}`;
      params.push(`%${filter.tag}%`);
    }

    if (filter.search) {
      whereClause += ` AND (phone_number LIKE $${paramIndex} OR name LIKE $${paramIndex + 1} OR email LIKE $${paramIndex + 2} OR company LIKE $${paramIndex + 3})`;
      const searchPattern = `%${filter.search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
      paramIndex += 4;
    }

    // Get total count
    const countRow = await this.db.get<{ count: string }>(
      `SELECT COUNT(*) as count FROM contacts ${whereClause}`,
      params
    );
    const total = countRow ? parseInt(countRow.count, 10) : 0;

    // Get paginated results
    let query = `SELECT * FROM contacts ${whereClause} ORDER BY created_at DESC`;

    if (filter.limit) {
      query += ` LIMIT ${filter.limit}`;
      if (filter.offset) {
        query += ` OFFSET ${filter.offset}`;
      }
    }

    const rows = await this.db.all<ContactRow>(query, params);

    return {
      contacts: rows.map(rowToContact),
      total,
    };
  }

  /**
   * Get all contacts for Asterisk config generation (all tenants)
   */
  async findAllForAsterisk(): Promise<(Contact & { tenantId: string })[]> {
    const rows = await this.db.all<ContactRow>(
      'SELECT * FROM contacts WHERE status = $1 ORDER BY tenant_id, phone_number',
      ['active']
    );
    return rows.map(rowToContact);
  }

  async update(id: string, updates: Partial<Omit<Contact, 'id' | 'createdAt' | 'updatedAt' | 'customFields'>>, tenantId?: string): Promise<(Contact & { tenantId: string }) | null> {
    const existing = await this.findById(id, tenantId);
    if (!existing) return null;

    const fields: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.phoneNumber !== undefined) {
      fields.push(`phone_number = $${paramIndex++}`);
      values.push(updates.phoneNumber);
    }
    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.email !== undefined) {
      fields.push(`email = $${paramIndex++}`);
      values.push(updates.email);
    }
    if (updates.company !== undefined) {
      fields.push(`company = $${paramIndex++}`);
      values.push(updates.company);
    }
    if (updates.notes !== undefined) {
      fields.push(`notes = $${paramIndex++}`);
      values.push(updates.notes);
    }
    if (updates.tags !== undefined) {
      fields.push(`tags = $${paramIndex++}`);
      values.push(updates.tags);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }

    let query = `UPDATE contacts SET ${fields.join(', ')} WHERE id = $${paramIndex++}`;
    values.push(id);

    if (tenantId) {
      query += ` AND tenant_id = $${paramIndex}`;
      values.push(tenantId);
    }

    await this.db.run(query, values);

    dbLogger.info(`Contact updated: ${id}`);
    return this.findById(id, tenantId);
  }

  async delete(id: string, tenantId?: string): Promise<boolean> {
    let query = 'DELETE FROM contacts WHERE id = $1';
    const params: unknown[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const result = await this.db.run(query, params);
    if (result.rowCount > 0) {
      dbLogger.info(`Contact deleted: ${id}`);
      return true;
    }
    return false;
  }

  async bulkDelete(ids: string[], tenantId?: string): Promise<number> {
    if (ids.length === 0) return 0;

    let paramIndex = 1;
    const placeholders = ids.map(() => `$${paramIndex++}`).join(',');
    const params: unknown[] = [...ids];

    let query = `DELETE FROM contacts WHERE id IN (${placeholders})`;

    if (tenantId) {
      query += ` AND tenant_id = $${paramIndex}`;
      params.push(tenantId);
    }

    const result = await this.db.run(query, params);
    dbLogger.info(`Bulk deleted ${result.rowCount} contacts`);
    return result.rowCount;
  }

  // Custom fields
  async getCustomFields(contactId: string): Promise<Record<string, string>> {
    const rows = await this.db.all<ContactFieldRow>(
      'SELECT * FROM contact_fields WHERE contact_id = $1',
      [contactId]
    );

    const fields: Record<string, string> = {};
    for (const row of rows) {
      if (row.field_value) {
        fields[row.field_name] = row.field_value;
      }
    }
    return fields;
  }

  async setCustomField(contactId: string, fieldName: string, fieldValue: string): Promise<void> {
    await this.db.run(
      `INSERT INTO contact_fields (id, contact_id, field_name, field_value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(contact_id, field_name) DO UPDATE SET field_value = EXCLUDED.field_value`,
      [uuidv4(), contactId, fieldName, fieldValue]
    );
  }

  // Import functionality
  async importFromCSV(csvData: string, options: { skipDuplicates?: boolean; updateExisting?: boolean } = {}, tenantId: string = 'default'): Promise<ImportResult> {
    const result: ImportResult = {
      total: 0,
      imported: 0,
      duplicates: 0,
      errors: 0,
      errorDetails: [],
    };

    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
      result.errorDetails.push('CSV must have at least a header row and one data row');
      return result;
    }

    // Parse header
    const header = this.parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
    const phoneIndex = header.findIndex((h) => h === 'phone' || h === 'phone_number' || h === 'phonenumber');
    const nameIndex = header.findIndex((h) => h === 'name');
    const emailIndex = header.findIndex((h) => h === 'email');
    const companyIndex = header.findIndex((h) => h === 'company');
    const notesIndex = header.findIndex((h) => h === 'notes');
    const tagsIndex = header.findIndex((h) => h === 'tags');

    if (phoneIndex === -1) {
      result.errorDetails.push('CSV must have a "phone" or "phone_number" column');
      return result;
    }

    // Process data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      result.total++;

      try {
        const values = this.parseCSVLine(line);
        const phoneNumber = this.normalizePhone(values[phoneIndex]);

        if (!phoneNumber) {
          result.errors++;
          result.errorDetails.push(`Row ${i + 1}: Invalid phone number`);
          continue;
        }

        // Check for duplicate
        const existing = await this.findByPhone(phoneNumber, tenantId);
        if (existing) {
          if (options.updateExisting) {
            await this.update(existing.id, {
              name: nameIndex >= 0 ? values[nameIndex] || null : undefined,
              email: emailIndex >= 0 ? values[emailIndex] || null : undefined,
              company: companyIndex >= 0 ? values[companyIndex] || null : undefined,
              notes: notesIndex >= 0 ? values[notesIndex] || null : undefined,
              tags: tagsIndex >= 0 ? values[tagsIndex] || null : undefined,
            }, tenantId);
            result.imported++;
          } else {
            result.duplicates++;
          }
          continue;
        }

        // Create new contact
        await this.create({
          phoneNumber,
          name: nameIndex >= 0 ? values[nameIndex] || null : null,
          email: emailIndex >= 0 ? values[emailIndex] || null : null,
          company: companyIndex >= 0 ? values[companyIndex] || null : null,
          notes: notesIndex >= 0 ? values[notesIndex] || null : null,
          tags: tagsIndex >= 0 ? values[tagsIndex] || null : null,
          status: 'active',
        }, tenantId);

        result.imported++;
      } catch (error) {
        result.errors++;
        result.errorDetails.push(`Row ${i + 1}: ${error}`);
      }
    }

    dbLogger.info(`Imported ${result.imported} contacts from CSV (${result.duplicates} duplicates, ${result.errors} errors) for tenant ${tenantId}`);
    return result;
  }

  async importFromText(textData: string, tenantId: string = 'default'): Promise<ImportResult> {
    const result: ImportResult = {
      total: 0,
      imported: 0,
      duplicates: 0,
      errors: 0,
      errorDetails: [],
    };

    // Parse text - one phone number per line, optionally with name separated by comma or tab
    const lines = textData.trim().split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      result.total++;

      try {
        // Try to split by comma or tab
        const parts = line.split(/[,\t]/).map((p) => p.trim());
        const phoneNumber = this.normalizePhone(parts[0]);
        const name = parts[1] || null;

        if (!phoneNumber) {
          result.errors++;
          result.errorDetails.push(`Line ${i + 1}: Invalid phone number`);
          continue;
        }

        // Check for duplicate
        const existing = await this.findByPhone(phoneNumber, tenantId);
        if (existing) {
          result.duplicates++;
          continue;
        }

        await this.create({
          phoneNumber,
          name,
          email: null,
          company: null,
          notes: null,
          tags: null,
          status: 'active',
        }, tenantId);

        result.imported++;
      } catch (error) {
        result.errors++;
        result.errorDetails.push(`Line ${i + 1}: ${error}`);
      }
    }

    dbLogger.info(`Imported ${result.imported} contacts from text (${result.duplicates} duplicates, ${result.errors} errors) for tenant ${tenantId}`);
    return result;
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  private normalizePhone(phone: string): string | null {
    if (!phone) return null;

    // Remove all non-digit characters except leading +
    let normalized = phone.replace(/[^\d+]/g, '');

    // Must have at least 10 digits
    const digits = normalized.replace(/\D/g, '');
    if (digits.length < 10) return null;

    // Add + if missing for international numbers
    if (!normalized.startsWith('+') && digits.length > 10) {
      normalized = '+' + digits;
    }

    return normalized || null;
  }

  // Stats
  async getStats(tenantId?: string): Promise<{ total: number; active: number; dnc: number; invalid: number; archived: number }> {
    let query = 'SELECT status, COUNT(*) as count FROM contacts';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    query += ' GROUP BY status';

    const rows = await this.db.all<{ status: string; count: string }>(query, params);

    const stats = {
      total: 0,
      active: 0,
      dnc: 0,
      invalid: 0,
      archived: 0,
    };

    for (const row of rows) {
      const count = parseInt(row.count, 10);
      stats.total += count;
      if (row.status in stats) {
        (stats as any)[row.status] = count;
      }
    }

    return stats;
  }

  /**
   * Count contacts for a tenant
   */
  async count(tenantId?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM contacts';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    const result = await this.db.get<{ count: string }>(query, params);
    return result ? parseInt(result.count, 10) : 0;
  }

  // Export
  async exportToCSV(tenantId?: string): Promise<string> {
    const { contacts } = await this.findAll({}, tenantId);

    const headers = ['phone_number', 'name', 'email', 'company', 'notes', 'tags', 'status'];
    const lines = [headers.join(',')];

    for (const contact of contacts) {
      const values = [
        contact.phoneNumber,
        contact.name || '',
        contact.email || '',
        contact.company || '',
        contact.notes || '',
        contact.tags || '',
        contact.status,
      ].map((v) => `"${v.replace(/"/g, '""')}"`);

      lines.push(values.join(','));
    }

    return lines.join('\n');
  }
}
