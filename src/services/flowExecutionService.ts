/**
 * Flow Execution Service
 *
 * Executes AI Agent flows during phone conversations.
 * Manages state transitions, node execution, and variable interpolation.
 */

import { EventEmitter } from 'events';
import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { DatabaseManager } from '../db/database';
import { FlowStateRepository } from '../db/repositories/flowStateRepository';
import type {
  FlowData,
  FlowNode,
  FlowEdge,
  FlowState,
  NodeType,
  NodeData,
  StartNodeData,
  AIResponseNodeData,
  ListenNodeData,
  BranchNodeData,
  TransferNodeData,
  FunctionNodeData,
  CollectInfoNodeData,
  PlayAudioNodeData,
  EndNodeData,
  NodeExecutionResult,
  NodeAction,
  BranchDecision,
  BranchIntent,
} from '../types/flow';

// =============================================
// Flow Execution Context
// =============================================

export interface FlowExecutionContext {
  conversationId: string;
  agentId: string;
  flowData: FlowData;
  state: FlowState;
  callerId?: string;
  callerName?: string;
}

// =============================================
// Flow Execution Events
// =============================================

export interface FlowExecutionEvents {
  'speak': (conversationId: string, text: string, nodeId: string) => void;
  'listen': (conversationId: string, timeout: number, storeAs: string) => void;
  'transfer': (conversationId: string, destination: string, type: string, announce?: string) => void;
  'end': (conversationId: string, outcome: string, message?: string) => void;
  'error': (error: Error, nodeId?: string) => void;
  'node_entered': (nodeId: string, nodeType: NodeType) => void;
  'node_completed': (nodeId: string, result: NodeExecutionResult) => void;
  'variable_set': (key: string, value: unknown) => void;
  'state_changed': (newState: FlowState['state']) => void;
}

// =============================================
// Flow Execution Service
// =============================================

export class FlowExecutionService extends EventEmitter {
  private stateRepo: FlowStateRepository;
  private openai: OpenAI | null = null;
  private activeExecutions: Map<string, FlowExecutionContext> = new Map();

  constructor(private db: DatabaseManager) {
    super();
    this.stateRepo = new FlowStateRepository(db);
  }

  /**
   * Set OpenAI client for AI-powered features
   */
  setOpenAI(client: OpenAI): void {
    this.openai = client;
  }

  /**
   * Initialize a flow for a new conversation
   */
  async initializeFlow(
    conversationId: string,
    agentId: string,
    flowData: FlowData,
    initialVariables?: Record<string, unknown>
  ): Promise<FlowExecutionContext> {
    const startNode = flowData.nodes.find(n => n.type === 'start');
    if (!startNode) {
      throw new Error('Flow must have a start node');
    }

    const state = await this.stateRepo.create({
      conversationId,
      agentId,
      currentNodeId: startNode.id,
      variables: {
        ...initialVariables,
        _flow_start_time: Date.now(),
        _conversation_id: conversationId,
        _agent_id: agentId,
      },
    });

    const context: FlowExecutionContext = {
      conversationId,
      agentId,
      flowData,
      state,
    };

    this.activeExecutions.set(conversationId, context);
    logger.info(`[FlowExecution:${conversationId}] Flow initialized at node ${startNode.id}`);

    return context;
  }

  /**
   * Get the current execution context for a conversation
   */
  getContext(conversationId: string): FlowExecutionContext | undefined {
    return this.activeExecutions.get(conversationId);
  }

  /**
   * Execute the current node and return the result
   */
  async executeCurrentNode(conversationId: string): Promise<NodeExecutionResult> {
    const context = this.activeExecutions.get(conversationId);
    if (!context) {
      throw new Error(`No active flow for conversation ${conversationId}`);
    }

    const { flowData, state } = context;
    const currentNode = flowData.nodes.find(n => n.id === state.currentNodeId);

    if (!currentNode) {
      throw new Error(`Node ${state.currentNodeId} not found in flow`);
    }

    this.emit('node_entered', currentNode.id, currentNode.type);
    logger.info(`[FlowExecution:${conversationId}] Executing node ${currentNode.id} (${currentNode.type})`);

    try {
      const result = await this.executeNode(currentNode, context);
      this.emit('node_completed', currentNode.id, result);

      if (result.action) {
        await this.handleAction(result.action, context);
      }

      if (result.variables) {
        await this.stateRepo.setVariables(state.id, result.variables);
        context.state.variables = { ...context.state.variables, ...result.variables };

        for (const [key, value] of Object.entries(result.variables)) {
          this.emit('variable_set', key, value);
        }
      }

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`[FlowExecution:${conversationId}] Error executing node ${currentNode.id}:`, err);
      this.emit('error', err, currentNode.id);

      await this.stateRepo.updateState(state.id, 'error', err.message);
      context.state.state = 'error';
      this.emit('state_changed', 'error');

      return { success: false, error: err.message };
    }
  }

  /**
   * Handle user input and advance the flow
   */
  async handleUserInput(conversationId: string, input: string): Promise<NodeExecutionResult> {
    const context = this.activeExecutions.get(conversationId);
    if (!context) {
      throw new Error(`No active flow for conversation ${conversationId}`);
    }

    const { flowData, state } = context;
    const currentNode = flowData.nodes.find(n => n.id === state.currentNodeId);

    if (!currentNode) {
      throw new Error(`Current node ${state.currentNodeId} not found`);
    }

    logger.info(`[FlowExecution:${conversationId}] User input at node ${currentNode.id}: "${input.substring(0, 50)}..."`);

    if (currentNode.type === 'listen') {
      const listenData = currentNode.data as ListenNodeData;
      await this.stateRepo.setVariable(state.id, listenData.storeAs, input);
      context.state.variables[listenData.storeAs] = input;
      this.emit('variable_set', listenData.storeAs, input);
    }

    await this.stateRepo.setVariable(state.id, '_last_user_input', input);
    context.state.variables._last_user_input = input;

    if (state.state === 'waiting_input') {
      await this.stateRepo.updateState(state.id, 'active');
      context.state.state = 'active';
      this.emit('state_changed', 'active');
    }

    return this.transitionToNext(conversationId, input);
  }

  /**
   * Transition to the next node in the flow
   */
  async transitionToNext(
    conversationId: string,
    userInput?: string,
    outputHandle?: string
  ): Promise<NodeExecutionResult> {
    const context = this.activeExecutions.get(conversationId);
    if (!context) {
      throw new Error(`No active flow for conversation ${conversationId}`);
    }

    const { flowData, state } = context;
    const currentNode = flowData.nodes.find(n => n.id === state.currentNodeId);

    if (!currentNode) {
      throw new Error(`Current node ${state.currentNodeId} not found`);
    }

    let nextNodeId: string | undefined;

    if (currentNode.type === 'branch') {
      nextNodeId = await this.evaluateBranchConditions(currentNode, context, userInput || '');
    } else if (outputHandle) {
      const edge = flowData.edges.find(
        e => e.source === currentNode.id && e.sourceHandle === outputHandle
      );
      nextNodeId = edge?.target;
    } else {
      const edge = flowData.edges.find(e => e.source === currentNode.id);
      nextNodeId = edge?.target;
    }

    if (!nextNodeId) {
      logger.info(`[FlowExecution:${conversationId}] No next node from ${currentNode.id}, flow ending`);
      await this.stateRepo.updateState(state.id, 'completed');
      context.state.state = 'completed';
      this.emit('state_changed', 'completed');

      return { success: true, action: { type: 'end', outcome: 'completed' } };
    }

    await this.stateRepo.updateCurrentNode(state.id, nextNodeId);
    context.state.currentNodeId = nextNodeId;
    context.state.visitedNodes.push(nextNodeId);

    logger.info(`[FlowExecution:${conversationId}] Transitioned to node ${nextNodeId}`);

    return this.executeCurrentNode(conversationId);
  }

  /**
   * End the flow execution
   */
  async endFlow(conversationId: string, outcome: string = 'completed'): Promise<void> {
    const context = this.activeExecutions.get(conversationId);
    if (!context) return;

    await this.stateRepo.updateState(context.state.id, 'completed');
    context.state.state = 'completed';
    this.emit('state_changed', 'completed');

    this.activeExecutions.delete(conversationId);
    logger.info(`[FlowExecution:${conversationId}] Flow ended with outcome: ${outcome}`);
  }

  // =============================================
  // Node Executors
  // =============================================

  private async executeNode(node: FlowNode, context: FlowExecutionContext): Promise<NodeExecutionResult> {
    switch (node.type) {
      case 'start':
        return this.executeStartNode(node.data as StartNodeData, context);
      case 'aiResponse':
        return this.executeAIResponseNode(node.data as AIResponseNodeData, context);
      case 'listen':
        return this.executeListenNode(node.data as ListenNodeData, context);
      case 'branch':
        return this.executeBranchNode(node.data as BranchNodeData, context);
      case 'transfer':
        return this.executeTransferNode(node.data as TransferNodeData, context);
      case 'function':
        return this.executeFunctionNode(node.data as FunctionNodeData, context);
      case 'collectInfo':
        return this.executeCollectInfoNode(node.data as CollectInfoNodeData, context);
      case 'playAudio':
        return this.executePlayAudioNode(node.data as PlayAudioNodeData, context);
      case 'end':
        return this.executeEndNode(node.data as EndNodeData, context);
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  private async executeStartNode(data: StartNodeData, context: FlowExecutionContext): Promise<NodeExecutionResult> {
    const variables: Record<string, unknown> = {};
    if (data.initialVariables) {
      for (const [key, value] of Object.entries(data.initialVariables)) {
        variables[key] = this.interpolateVariables(value, context.state.variables);
      }
    }

    const greetingText = this.interpolateVariables(data.greetingText, context.state.variables);

    return {
      success: true,
      variables,
      action: { type: 'speak', text: greetingText },
    };
  }

  private async executeAIResponseNode(data: AIResponseNodeData, context: FlowExecutionContext): Promise<NodeExecutionResult> {
    let responseText: string;

    if (data.promptType === 'fixed' && data.fixedResponse) {
      responseText = this.interpolateVariables(data.fixedResponse, context.state.variables);
    } else if (this.openai && data.instruction) {
      const instruction = this.interpolateVariables(data.instruction, context.state.variables);

      try {
        const completion = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: instruction },
            { role: 'user', content: `Context: ${JSON.stringify(context.state.variables)}\n\nGenerate a natural phone response.` },
          ],
          temperature: data.temperature || 0.7,
          max_tokens: data.maxTokens || 200,
        });

        responseText = completion.choices[0]?.message?.content || 'I understand.';
      } catch (error) {
        logger.error('[FlowExecution] AI response generation failed:', error);
        responseText = 'I understand. How can I help you?';
      }
    } else {
      responseText = 'How can I help you?';
    }

    const variables: Record<string, unknown> = {};
    if (data.storeResultAs) {
      variables[data.storeResultAs] = responseText;
    }

    return { success: true, variables, action: { type: 'speak', text: responseText } };
  }

  private async executeListenNode(data: ListenNodeData, context: FlowExecutionContext): Promise<NodeExecutionResult> {
    await this.stateRepo.updateState(context.state.id, 'waiting_input');
    context.state.state = 'waiting_input';
    this.emit('state_changed', 'waiting_input');

    if (data.silencePrompt) {
      const prompt = this.interpolateVariables(data.silencePrompt, context.state.variables);
      this.emit('speak', context.conversationId, prompt, context.state.currentNodeId);
    }

    return {
      success: true,
      action: { type: 'listen', timeout: data.timeout, storeAs: data.storeAs },
    };
  }

  private async executeBranchNode(data: BranchNodeData, context: FlowExecutionContext): Promise<NodeExecutionResult> {
    return { success: true, action: { type: 'continue' } };
  }

  private async executeTransferNode(data: TransferNodeData, context: FlowExecutionContext): Promise<NodeExecutionResult> {
    const destination = this.interpolateVariables(data.destination, context.state.variables);

    return {
      success: true,
      action: { type: 'transfer', destination, transferType: data.transferType },
      variables: { _transfer_destination: destination, _transfer_type: data.transferType },
    };
  }

  private async executeFunctionNode(data: FunctionNodeData, context: FlowExecutionContext): Promise<NodeExecutionResult> {
    if (data.functionType === 'webhook' && data.webhookUrl) {
      return this.executeWebhook(data, context);
    } else if (data.functionType === 'builtin' && data.builtinFunction) {
      return this.executeBuiltinFunction(data, context);
    }
    return { success: true, action: { type: 'continue' } };
  }

  private async executeWebhook(data: FunctionNodeData, context: FlowExecutionContext): Promise<NodeExecutionResult> {
    try {
      const url = this.interpolateVariables(data.webhookUrl!, context.state.variables);
      const body = data.webhookBody ? this.interpolateVariables(data.webhookBody, context.state.variables) : undefined;

      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...data.webhookHeaders };

      const response = await fetch(url, {
        method: data.webhookMethod || 'POST',
        headers,
        body: body ? body : undefined,
      });

      const result = await response.json();
      const variables: Record<string, unknown> = {};

      if (data.storeResultAs) {
        variables[data.storeResultAs] = result;
      }

      if (data.responseMapping) {
        for (const mapping of data.responseMapping) {
          const value = this.getNestedValue(result, mapping.path);
          if (value !== undefined) {
            variables[mapping.variable] = value;
          }
        }
      }

      return { success: true, variables, action: { type: 'continue' } };
    } catch (error) {
      logger.error('[FlowExecution] Webhook failed:', error);

      if (data.onError === 'goto' && data.errorNode) {
        return { success: false, nextNodeId: data.errorNode, error: String(error) };
      }

      return { success: false, error: String(error), action: { type: 'continue' } };
    }
  }

  private async executeBuiltinFunction(data: FunctionNodeData, context: FlowExecutionContext): Promise<NodeExecutionResult> {
    switch (data.builtinFunction) {
      case 'check_hours':
        const now = new Date();
        const hour = now.getHours();
        const isOpen = hour >= 9 && hour < 17;
        return { success: true, variables: { _business_hours_open: isOpen }, action: { type: 'continue' } };

      case 'end_call':
        return { success: true, action: { type: 'end', outcome: 'completed' } };

      default:
        logger.warn(`[FlowExecution] Unknown builtin function: ${data.builtinFunction}`);
        return { success: true, action: { type: 'continue' } };
    }
  }

  private async executeCollectInfoNode(data: CollectInfoNodeData, context: FlowExecutionContext): Promise<NodeExecutionResult> {
    const collectedFields = (context.state.variables._collected_fields as string[]) || [];
    const currentFieldIndex = collectedFields.length;

    if (currentFieldIndex >= data.fields.length) {
      if (data.onComplete === 'summary' && data.summaryTemplate) {
        const summary = this.interpolateVariables(data.summaryTemplate, context.state.variables);
        return { success: true, action: { type: 'speak', text: summary } };
      }
      return { success: true, action: { type: 'continue' } };
    }

    const field = data.fields[currentFieldIndex];
    const prompt = this.interpolateVariables(field.prompt, context.state.variables);

    await this.stateRepo.setVariable(context.state.id, '_current_field', field.name);
    context.state.variables._current_field = field.name;

    return { success: true, action: { type: 'speak', text: prompt } };
  }

  private async executePlayAudioNode(data: PlayAudioNodeData, context: FlowExecutionContext): Promise<NodeExecutionResult> {
    if (data.source === 'tts' && data.ttsText) {
      const text = this.interpolateVariables(data.ttsText, context.state.variables);
      return { success: true, action: { type: 'speak', text } };
    }
    return { success: true, action: { type: 'continue' } };
  }

  private async executeEndNode(data: EndNodeData, context: FlowExecutionContext): Promise<NodeExecutionResult> {
    let goodbyeMessage: string | undefined;

    if (data.goodbyeType === 'text' && data.goodbyeMessage) {
      goodbyeMessage = this.interpolateVariables(data.goodbyeMessage, context.state.variables);
    }

    await this.stateRepo.updateState(context.state.id, 'completed');
    context.state.state = 'completed';
    this.emit('state_changed', 'completed');

    return { success: true, action: { type: 'end', outcome: data.outcome, message: goodbyeMessage } };
  }

  // =============================================
  // Branch Evaluation
  // =============================================

  private async evaluateBranchConditions(node: FlowNode, context: FlowExecutionContext, userInput: string): Promise<string | undefined> {
    const data = node.data as BranchNodeData;
    const { flowData } = context;

    let selectedOutput: string = data.defaultOutput;

    switch (data.conditionType) {
      case 'intent':
        if (data.intents && data.intents.length > 0) {
          selectedOutput = await this.classifyIntent(userInput, data.intents, data.defaultOutput);
        }
        break;

      case 'keyword':
        if (data.keywords) {
          for (const kw of data.keywords) {
            const inputLower = userInput.toLowerCase();
            if (kw.words.some(word => inputLower.includes(word.toLowerCase()))) {
              selectedOutput = kw.output;
              break;
            }
          }
        }
        break;

      case 'variable':
        if (data.variableConditions) {
          for (const cond of data.variableConditions) {
            const varValue = String(context.state.variables[cond.variable] || '');
            let matches = false;

            switch (cond.operator) {
              case 'equals': matches = varValue === cond.value; break;
              case 'contains': matches = varValue.includes(cond.value); break;
              case 'greater': matches = parseFloat(varValue) > parseFloat(cond.value); break;
              case 'less': matches = parseFloat(varValue) < parseFloat(cond.value); break;
              case 'regex': matches = new RegExp(cond.value).test(varValue); break;
              case 'empty': matches = !varValue; break;
              case 'not_empty': matches = !!varValue; break;
            }

            if (matches) {
              selectedOutput = cond.output;
              break;
            }
          }
        }
        break;

      case 'ai_classification':
        if (this.openai && data.classificationPrompt && data.classificationOptions) {
          selectedOutput = await this.aiClassify(userInput, data.classificationPrompt, data.classificationOptions, data.defaultOutput);
        }
        break;
    }

    const decision: BranchDecision = {
      nodeId: node.id,
      condition: `${data.conditionType}: ${userInput.substring(0, 50)}`,
      selectedOutput,
      timestamp: Date.now(),
    };
    await this.stateRepo.addBranchDecision(context.state.id, decision);
    context.state.branchHistory.push(decision);

    const edge = flowData.edges.find(e => e.source === node.id && e.sourceHandle === selectedOutput);
    logger.info(`[FlowExecution:${context.conversationId}] Branch ${node.id} -> ${selectedOutput} -> ${edge?.target || 'none'}`);

    return edge?.target;
  }

  private async classifyIntent(userInput: string, intents: BranchIntent[], defaultOutput: string): Promise<string> {
    if (!this.openai) {
      const inputLower = userInput.toLowerCase();
      for (const intent of intents) {
        for (const example of intent.examples) {
          if (inputLower.includes(example.toLowerCase())) {
            return intent.output;
          }
        }
      }
      return defaultOutput;
    }

    try {
      const intentDescriptions = intents.map(i => `- "${i.name}": ${i.examples.join(', ')}`).join('\n');

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `Classify into one intent:\n${intentDescriptions}\n\nRespond with ONLY the intent name.` },
          { role: 'user', content: userInput },
        ],
        temperature: 0.3,
        max_tokens: 50,
      });

      const classified = completion.choices[0]?.message?.content?.trim().toLowerCase() || 'default';
      const matchedIntent = intents.find(i => i.name.toLowerCase() === classified);

      return matchedIntent?.output || defaultOutput;
    } catch (error) {
      logger.error('[FlowExecution] Intent classification failed:', error);
      return defaultOutput;
    }
  }

  private async aiClassify(userInput: string, prompt: string, options: { label: string; description: string; output: string }[], defaultOutput: string): Promise<string> {
    if (!this.openai) return defaultOutput;

    try {
      const optionDescriptions = options.map(o => `- "${o.label}": ${o.description}`).join('\n');

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `${prompt}\n\nCategories:\n${optionDescriptions}\n\nRespond with ONLY the label.` },
          { role: 'user', content: userInput },
        ],
        temperature: 0.3,
        max_tokens: 50,
      });

      const classified = completion.choices[0]?.message?.content?.trim().toLowerCase() || '';
      const matchedOption = options.find(o => o.label.toLowerCase() === classified);

      return matchedOption?.output || defaultOutput;
    } catch (error) {
      logger.error('[FlowExecution] AI classification failed:', error);
      return defaultOutput;
    }
  }

  // =============================================
  // Action Handler
  // =============================================

  private async handleAction(action: NodeAction, context: FlowExecutionContext): Promise<void> {
    const { conversationId } = context;
    switch (action.type) {
      case 'speak':
        this.emit('speak', conversationId, action.text, context.state.currentNodeId);
        break;
      case 'listen':
        this.emit('listen', conversationId, action.timeout, action.storeAs);
        break;
      case 'transfer':
        this.emit('transfer', conversationId, action.destination, action.transferType);
        break;
      case 'end':
        this.emit('end', conversationId, action.outcome, action.message);
        break;
    }
  }

  // =============================================
  // Utilities
  // =============================================

  interpolateVariables(text: string, variables: Record<string, unknown>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      const value = variables[varName];
      if (value === undefined) return match;
      return String(value);
    });
  }

  private getNestedValue(obj: any, path: string): unknown {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}
