/**
 * Flow State Repository
 * Manages flow execution state during conversations
 */

import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database';
import { dbLogger } from '../../utils/logger';
import type { FlowState, BranchDecision } from '../../types/flow';

// ==========================================
// ROW TYPES
// ==========================================

interface FlowStateRow {
  id: string;
  conversation_id: string;
  agent_id: string;
  current_node_id: string;
  variables: string;
  visited_nodes: string;
  branch_history: string;
  state: string;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

// ==========================================
// INPUT TYPES
// ==========================================

export interface CreateFlowStateInput {
  conversationId: string;
  agentId: string;
  currentNodeId: string;
  variables?: Record<string, unknown>;
}

// ==========================================
// REPOSITORY CLASS
// ==========================================

export class FlowStateRepository {
  constructor(private db: DatabaseManager) {}

  /**
   * Create a new flow state for a conversation
   */
  async create(input: CreateFlowStateInput): Promise<FlowState> {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    await this.db.run(`
      INSERT INTO ai_flow_state (
        id, conversation_id, agent_id, current_node_id,
        variables, visited_nodes, branch_history, state,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      id,
      input.conversationId,
      input.agentId,
      input.currentNodeId,
      JSON.stringify(input.variables || {}),
      JSON.stringify([input.currentNodeId]),
      JSON.stringify([]),
      'active',
      now,
      now,
    ]);

    dbLogger.info(`Flow state created: ${id} for conversation ${input.conversationId}`);

    return {
      id,
      conversationId: input.conversationId,
      agentId: input.agentId,
      currentNodeId: input.currentNodeId,
      variables: input.variables || {},
      visitedNodes: [input.currentNodeId],
      branchHistory: [],
      state: 'active',
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Find flow state by ID
   */
  async findById(id: string): Promise<FlowState | null> {
    const row = await this.db.get<FlowStateRow>(
      'SELECT * FROM ai_flow_state WHERE id = $1',
      [id]
    );
    return row ? this.mapRow(row) : null;
  }

  /**
   * Find flow state by conversation ID
   */
  async findByConversationId(conversationId: string): Promise<FlowState | null> {
    const row = await this.db.get<FlowStateRow>(
      'SELECT * FROM ai_flow_state WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1',
      [conversationId]
    );
    return row ? this.mapRow(row) : null;
  }

  /**
   * Find active flow states for an agent
   */
  async findActiveByAgentId(agentId: string): Promise<FlowState[]> {
    const rows = await this.db.all<FlowStateRow>(`
      SELECT * FROM ai_flow_state
      WHERE agent_id = $1 AND state IN ('active', 'waiting_input')
      ORDER BY updated_at DESC
    `, [agentId]);
    return rows.map(row => this.mapRow(row));
  }

  /**
   * Update current node
   */
  async updateCurrentNode(id: string, nodeId: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const state = await this.findById(id);
    if (!state) return;

    const visitedNodes = [...state.visitedNodes, nodeId];

    await this.db.run(`
      UPDATE ai_flow_state
      SET current_node_id = $1, visited_nodes = $2, updated_at = $3
      WHERE id = $4
    `, [nodeId, JSON.stringify(visitedNodes), now, id]);
  }

  /**
   * Update state (active, paused, waiting_input, completed, error)
   */
  async updateState(
    id: string,
    newState: FlowState['state'],
    errorMessage?: string
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    await this.db.run(`
      UPDATE ai_flow_state
      SET state = $1, error_message = $2, updated_at = $3
      WHERE id = $4
    `, [newState, errorMessage || null, now, id]);
  }

  /**
   * Set a variable value
   */
  async setVariable(id: string, key: string, value: unknown): Promise<void> {
    const state = await this.findById(id);
    if (!state) return;

    const variables = { ...state.variables, [key]: value };
    const now = Math.floor(Date.now() / 1000);

    await this.db.run(`
      UPDATE ai_flow_state
      SET variables = $1, updated_at = $2
      WHERE id = $3
    `, [JSON.stringify(variables), now, id]);
  }

  /**
   * Set multiple variables at once
   */
  async setVariables(id: string, newVariables: Record<string, unknown>): Promise<void> {
    const state = await this.findById(id);
    if (!state) return;

    const variables = { ...state.variables, ...newVariables };
    const now = Math.floor(Date.now() / 1000);

    await this.db.run(`
      UPDATE ai_flow_state
      SET variables = $1, updated_at = $2
      WHERE id = $3
    `, [JSON.stringify(variables), now, id]);
  }

  /**
   * Add a branch decision to history
   */
  async addBranchDecision(id: string, decision: BranchDecision): Promise<void> {
    const state = await this.findById(id);
    if (!state) return;

    const branchHistory = [...state.branchHistory, decision];
    const now = Math.floor(Date.now() / 1000);

    await this.db.run(`
      UPDATE ai_flow_state
      SET branch_history = $1, updated_at = $2
      WHERE id = $3
    `, [JSON.stringify(branchHistory), now, id]);
  }

  /**
   * Delete flow state by ID
   */
  async delete(id: string): Promise<void> {
    await this.db.run('DELETE FROM ai_flow_state WHERE id = $1', [id]);
  }

  /**
   * Delete old completed/error states (cleanup)
   */
  async deleteOldStates(olderThanDays: number): Promise<number> {
    const threshold = Math.floor(Date.now() / 1000) - (olderThanDays * 24 * 60 * 60);

    const result = await this.db.run(`
      DELETE FROM ai_flow_state
      WHERE state IN ('completed', 'error')
        AND updated_at < $1
    `, [threshold]);

    return result.rowCount;
  }

  /**
   * Get full state with all data
   */
  async getFullState(id: string): Promise<FlowState | null> {
    return this.findById(id);
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private mapRow(row: FlowStateRow): FlowState {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      agentId: row.agent_id,
      currentNodeId: row.current_node_id,
      variables: JSON.parse(row.variables || '{}'),
      visitedNodes: JSON.parse(row.visited_nodes || '[]'),
      branchHistory: JSON.parse(row.branch_history || '[]'),
      state: row.state as FlowState['state'],
      errorMessage: row.error_message || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
