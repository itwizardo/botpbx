import { DatabaseManager } from '../database';
import { v4 as uuidv4 } from 'uuid';

export interface OutboundRoute {
  id: string;
  name: string;
  pattern: string;
  trunkId: string;
  trunkName?: string;
  priority: number;
  prefixToAdd: string | null;
  prefixToStrip: number;
  callerId: string | null;
  enabled: boolean;
  createdAt: number;
}

interface OutboundRouteRow {
  id: string;
  name: string;
  pattern: string;
  trunk_id: string;
  trunk_name?: string;
  priority: number;
  prefix_to_add: string | null;
  prefix_to_strip: number;
  caller_id: string | null;
  enabled: boolean;
  created_at: Date | string | number;
}

export class OutboundRouteRepository {
  constructor(private db: DatabaseManager) {}

  private mapRowToRoute(row: OutboundRouteRow): OutboundRoute {
    return {
      id: row.id,
      name: row.name,
      pattern: row.pattern,
      trunkId: row.trunk_id,
      trunkName: row.trunk_name,
      priority: row.priority,
      prefixToAdd: row.prefix_to_add,
      prefixToStrip: row.prefix_to_strip,
      callerId: row.caller_id,
      enabled: row.enabled,
      createdAt: typeof row.created_at === 'object' ? Math.floor(new Date(row.created_at).getTime() / 1000) :
                 typeof row.created_at === 'string' ? Math.floor(new Date(row.created_at).getTime() / 1000) : row.created_at,
    };
  }

  async findAll(): Promise<OutboundRoute[]> {
    const rows = await this.db.all<OutboundRouteRow>(`
      SELECT r.*, t.name as trunk_name
      FROM outbound_routes r
      LEFT JOIN sip_trunks t ON r.trunk_id = t.id
      ORDER BY r.priority ASC, r.name ASC
    `);
    return rows.map(row => this.mapRowToRoute(row));
  }

  async findAllEnabled(): Promise<OutboundRoute[]> {
    const rows = await this.db.all<OutboundRouteRow>(`
      SELECT r.*, t.name as trunk_name
      FROM outbound_routes r
      LEFT JOIN sip_trunks t ON r.trunk_id = t.id
      WHERE r.enabled = true
      ORDER BY r.priority ASC
    `);
    return rows.map(row => this.mapRowToRoute(row));
  }

  async findById(id: string): Promise<OutboundRoute | null> {
    const row = await this.db.get<OutboundRouteRow>(`
      SELECT r.*, t.name as trunk_name
      FROM outbound_routes r
      LEFT JOIN sip_trunks t ON r.trunk_id = t.id
      WHERE r.id = $1
    `, [id]);
    return row ? this.mapRowToRoute(row) : null;
  }

  async findByPattern(pattern: string): Promise<OutboundRoute | null> {
    const row = await this.db.get<OutboundRouteRow>(`
      SELECT r.*, t.name as trunk_name
      FROM outbound_routes r
      LEFT JOIN sip_trunks t ON r.trunk_id = t.id
      WHERE r.pattern = $1
    `, [pattern]);
    return row ? this.mapRowToRoute(row) : null;
  }

  /**
   * Find the best matching route for a given number
   * Uses Asterisk-style pattern matching
   */
  async findMatchingRoute(number: string): Promise<OutboundRoute | null> {
    const routes = await this.findAllEnabled();

    for (const route of routes) {
      if (this.matchPattern(number, route.pattern)) {
        return route;
      }
    }

    return null;
  }

  /**
   * Match a number against an Asterisk-style pattern
   * Patterns:
   * - X = any digit 0-9
   * - Z = any digit 1-9
   * - N = any digit 2-9
   * - [12-5] = any digit in range
   * - . = one or more characters (wildcard)
   * - ! = zero or more characters (wildcard)
   * - _ prefix indicates pattern
   */
  private matchPattern(number: string, pattern: string): boolean {
    // Remove underscore prefix if present
    let p = pattern.startsWith('_') ? pattern.substring(1) : pattern;

    // Exact match
    if (p === number) return true;

    // Wildcard at end matches everything
    if (p === '.') return true;
    if (p === '!') return true;

    let numIdx = 0;
    let patIdx = 0;

    while (patIdx < p.length && numIdx < number.length) {
      const patChar = p[patIdx];
      const numChar = number[numIdx];

      if (patChar === 'X') {
        // Match any digit
        if (!/\d/.test(numChar)) return false;
      } else if (patChar === 'Z') {
        // Match 1-9
        if (!/[1-9]/.test(numChar)) return false;
      } else if (patChar === 'N') {
        // Match 2-9
        if (!/[2-9]/.test(numChar)) return false;
      } else if (patChar === '.') {
        // Match one or more remaining characters
        return numIdx < number.length;
      } else if (patChar === '!') {
        // Match zero or more remaining characters
        return true;
      } else if (patChar === '[') {
        // Character class
        const endBracket = p.indexOf(']', patIdx);
        if (endBracket === -1) return false;
        const charClass = p.substring(patIdx + 1, endBracket);
        if (!this.matchCharClass(numChar, charClass)) return false;
        patIdx = endBracket;
      } else {
        // Literal match
        if (patChar !== numChar) return false;
      }

      numIdx++;
      patIdx++;
    }

    // Check if pattern ends with wildcard
    if (patIdx < p.length) {
      const remaining = p.substring(patIdx);
      if (remaining === '.' || remaining === '!') return true;
      return false;
    }

    return numIdx === number.length;
  }

  private matchCharClass(char: string, charClass: string): boolean {
    for (let i = 0; i < charClass.length; i++) {
      if (i + 2 < charClass.length && charClass[i + 1] === '-') {
        // Range
        const start = charClass[i];
        const end = charClass[i + 2];
        if (char >= start && char <= end) return true;
        i += 2;
      } else {
        if (charClass[i] === char) return true;
      }
    }
    return false;
  }

  async create(data: {
    name: string;
    pattern: string;
    trunkId: string;
    priority?: number;
    prefixToAdd?: string;
    prefixToStrip?: number;
    callerId?: string;
    enabled?: boolean;
  }): Promise<OutboundRoute> {
    const id = uuidv4();
    const createdAt = Math.floor(Date.now() / 1000);

    await this.db.run(`
      INSERT INTO outbound_routes (id, name, pattern, trunk_id, priority, prefix_to_add, prefix_to_strip, caller_id, enabled, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      id,
      data.name,
      data.pattern,
      data.trunkId,
      data.priority ?? 0,
      data.prefixToAdd ?? null,
      data.prefixToStrip ?? 0,
      data.callerId ?? null,
      data.enabled !== false,
      createdAt,
    ]);

    const result = await this.findById(id);
    return result!;
  }

  async update(id: string, data: Partial<{
    name: string;
    pattern: string;
    trunkId: string;
    priority: number;
    prefixToAdd: string | null;
    prefixToStrip: number;
    callerId: string | null;
    enabled: boolean;
  }>): Promise<OutboundRoute | null> {
    const route = await this.findById(id);
    if (!route) return null;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.pattern !== undefined) {
      updates.push(`pattern = $${paramIndex++}`);
      values.push(data.pattern);
    }
    if (data.trunkId !== undefined) {
      updates.push(`trunk_id = $${paramIndex++}`);
      values.push(data.trunkId);
    }
    if (data.priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(data.priority);
    }
    if (data.prefixToAdd !== undefined) {
      updates.push(`prefix_to_add = $${paramIndex++}`);
      values.push(data.prefixToAdd);
    }
    if (data.prefixToStrip !== undefined) {
      updates.push(`prefix_to_strip = $${paramIndex++}`);
      values.push(data.prefixToStrip);
    }
    if (data.callerId !== undefined) {
      updates.push(`caller_id = $${paramIndex++}`);
      values.push(data.callerId);
    }
    if (data.enabled !== undefined) {
      updates.push(`enabled = $${paramIndex++}`);
      values.push(!!data.enabled);
    }

    if (updates.length === 0) return route;

    values.push(id);
    await this.db.run(`
      UPDATE outbound_routes SET ${updates.join(', ')} WHERE id = $${paramIndex}
    `, values);

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM outbound_routes WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  /**
   * Reorder routes by updating priorities
   */
  async reorder(routeIds: string[]): Promise<void> {
    for (let index = 0; index < routeIds.length; index++) {
      await this.db.run('UPDATE outbound_routes SET priority = $1 WHERE id = $2', [index, routeIds[index]]);
    }
  }
}
