/**
 * Flow Builder Types for Backend Execution
 * These types mirror the frontend types for consistency
 */

// =============================================
// Core Flow Structure
// =============================================

export interface FlowData {
  version: '1.0';
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport?: FlowViewport;
}

export interface FlowViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
  selected?: boolean;
  dragging?: boolean;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  type?: 'default' | 'smoothstep' | 'step';
  animated?: boolean;
  style?: Record<string, unknown>;
}

// =============================================
// Node Types
// =============================================

export type NodeType =
  | 'start'
  | 'aiResponse'
  | 'listen'
  | 'branch'
  | 'transfer'
  | 'function'
  | 'collectInfo'
  | 'playAudio'
  | 'end';

export type NodeData =
  | StartNodeData
  | AIResponseNodeData
  | ListenNodeData
  | BranchNodeData
  | TransferNodeData
  | FunctionNodeData
  | CollectInfoNodeData
  | PlayAudioNodeData
  | EndNodeData;

// =============================================
// Individual Node Data Types
// =============================================

/** Start Node - Entry point for the flow */
export interface StartNodeData {
  type: 'start';
  label: string;
  greetingText: string;
  greetingType: 'text' | 'prompt';
  promptId?: string;
  initialVariables?: Record<string, string>;
}

/** AI Response Node - Generate response using LLM */
export interface AIResponseNodeData {
  type: 'aiResponse';
  label: string;
  instruction?: string;
  promptType: 'dynamic' | 'fixed';
  fixedResponse?: string;
  storeResultAs?: string;
  temperature?: number;
  maxTokens?: number;
}

/** Listen Node - Wait for user input */
export interface ListenNodeData {
  type: 'listen';
  label: string;
  storeAs: string;
  timeout: number;
  timeoutAction: 'continue' | 'repeat' | 'goto';
  timeoutGotoNode?: string;
  silencePrompt?: string;
  validation?: ListenValidation;
}

export interface ListenValidation {
  type: 'none' | 'regex' | 'list' | 'confirmation';
  pattern?: string;
  options?: string[];
  errorMessage?: string;
}

/** Branch Node - Conditional routing */
export interface BranchNodeData {
  type: 'branch';
  label: string;
  conditionType: 'intent' | 'keyword' | 'variable' | 'ai_classification';

  // Intent-based routing (AI classifies user intent)
  intents?: BranchIntent[];

  // Keyword-based routing (simple string matching)
  keywords?: BranchKeyword[];

  // Variable-based routing (check stored values)
  variableConditions?: BranchVariableCondition[];

  // AI classification (custom prompt)
  classificationPrompt?: string;
  classificationOptions?: BranchClassificationOption[];

  defaultOutput: string;
}

export interface BranchIntent {
  name: string;
  examples: string[];
  output: string;
}

export interface BranchKeyword {
  words: string[];
  output: string;
}

export interface BranchVariableCondition {
  variable: string;
  operator: 'equals' | 'contains' | 'greater' | 'less' | 'regex' | 'empty' | 'not_empty';
  value: string;
  output: string;
}

export interface BranchClassificationOption {
  label: string;
  description: string;
  output: string;
}

/** Transfer Node - Transfer call to destination */
export interface TransferNodeData {
  type: 'transfer';
  label: string;
  transferType: 'extension' | 'queue' | 'ring_group' | 'external' | 'trunk';
  destination: string;
  trunkId?: string;
  announceMessage?: string;
  announceTo: 'caller' | 'agent' | 'both' | 'none';
  failoverAction: 'continue' | 'end' | 'goto';
  failoverNode?: string;
  timeout: number;
}

/** Function Node - Call API or execute built-in function */
export interface FunctionNodeData {
  type: 'function';
  label: string;
  functionType: 'builtin' | 'webhook';

  // Built-in function configuration
  builtinFunction?: BuiltinFunction;
  builtinParams?: Record<string, string>;

  // Webhook configuration
  webhookUrl?: string;
  webhookMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  webhookHeaders?: Record<string, string>;
  webhookBody?: string;

  // Response handling
  storeResultAs?: string;
  responseMapping?: ResponseMapping[];

  // Error handling
  onError: 'continue' | 'retry' | 'goto';
  retryCount?: number;
  errorNode?: string;
}

export type BuiltinFunction =
  | 'collect_info'
  | 'lookup_customer'
  | 'check_hours'
  | 'send_sms'
  | 'schedule_callback'
  | 'transfer_to_extension'
  | 'transfer_to_queue'
  | 'end_call';

export interface ResponseMapping {
  path: string;
  variable: string;
}

/** Collect Info Node - Structured data collection */
export interface CollectInfoNodeData {
  type: 'collectInfo';
  label: string;
  fields: CollectInfoField[];
  confirmAll: boolean;
  onComplete: 'continue' | 'summary';
  summaryTemplate?: string;
}

export interface CollectInfoField {
  name: string;
  prompt: string;
  type: 'text' | 'phone' | 'email' | 'number' | 'date' | 'time' | 'yes_no';
  required: boolean;
  validation?: FieldValidation;
  confirmationPrompt?: string;
}

export interface FieldValidation {
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  errorMessage?: string;
}

/** Play Audio Node - Play a prompt file */
export interface PlayAudioNodeData {
  type: 'playAudio';
  label: string;
  source: 'prompt' | 'url' | 'tts';
  promptId?: string;
  audioUrl?: string;
  ttsText?: string;
  interruptible: boolean;
  dtmfEnabled: boolean;
}

/** End Call Node - Terminate the conversation */
export interface EndNodeData {
  type: 'end';
  label: string;
  goodbyeMessage?: string;
  goodbyeType: 'text' | 'prompt' | 'none';
  promptId?: string;
  outcome: 'completed' | 'transferred' | 'abandoned' | 'error';
  outcomeDetails?: string;
  logData?: Record<string, string>;
}

// =============================================
// Flow Execution State
// =============================================

export interface FlowState {
  id: string;
  conversationId: string;
  agentId: string;
  currentNodeId: string;
  variables: Record<string, unknown>;
  visitedNodes: string[];
  branchHistory: BranchDecision[];
  state: 'active' | 'paused' | 'waiting_input' | 'completed' | 'error';
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BranchDecision {
  nodeId: string;
  condition: string;
  selectedOutput: string;
  timestamp: number;
}

// =============================================
// Execution Results
// =============================================

export interface NodeExecutionResult {
  success: boolean;
  nextNodeId?: string;
  output?: string;
  variables?: Record<string, unknown>;
  action?: NodeAction;
  error?: string;
}

export type NodeAction =
  | { type: 'speak'; text: string }
  | { type: 'listen'; timeout: number; storeAs: string }
  | { type: 'transfer'; destination: string; transferType: string }
  | { type: 'end'; outcome: string; message?: string }
  | { type: 'wait_input' }
  | { type: 'continue' };
