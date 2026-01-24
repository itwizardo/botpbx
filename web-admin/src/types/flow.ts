// Flow Builder Types for AI Agents

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
// Node Configuration Metadata
// =============================================

export interface NodeTypeConfig {
  type: NodeType;
  label: string;
  description: string;
  icon: string;
  color: string;
  inputs: number;
  outputs: number | 'dynamic';
  category: 'entry' | 'conversation' | 'routing' | 'action' | 'exit';
}

export const NODE_TYPE_CONFIGS: NodeTypeConfig[] = [
  {
    type: 'start',
    label: 'Start',
    description: 'Entry point with greeting',
    icon: 'PlayCircle',
    color: '#22c55e',
    inputs: 0,
    outputs: 1,
    category: 'entry',
  },
  {
    type: 'aiResponse',
    label: 'AI Response',
    description: 'Generate AI-powered response',
    icon: 'Sparkles',
    color: '#8b5cf6',
    inputs: 1,
    outputs: 1,
    category: 'conversation',
  },
  {
    type: 'listen',
    label: 'Listen',
    description: 'Wait for user input',
    icon: 'Ear',
    color: '#3b82f6',
    inputs: 1,
    outputs: 2,
    category: 'conversation',
  },
  {
    type: 'branch',
    label: 'Branch',
    description: 'Route based on conditions',
    icon: 'GitBranch',
    color: '#f59e0b',
    inputs: 1,
    outputs: 'dynamic',
    category: 'routing',
  },
  {
    type: 'transfer',
    label: 'Transfer',
    description: 'Transfer call to destination',
    icon: 'PhoneForwarded',
    color: '#06b6d4',
    inputs: 1,
    outputs: 2,
    category: 'action',
  },
  {
    type: 'function',
    label: 'Function',
    description: 'Call API or execute action',
    icon: 'Code',
    color: '#ec4899',
    inputs: 1,
    outputs: 2,
    category: 'action',
  },
  {
    type: 'collectInfo',
    label: 'Collect Info',
    description: 'Gather structured data',
    icon: 'ClipboardList',
    color: '#14b8a6',
    inputs: 1,
    outputs: 2,
    category: 'conversation',
  },
  {
    type: 'playAudio',
    label: 'Play Audio',
    description: 'Play a prompt file',
    icon: 'Volume2',
    color: '#6366f1',
    inputs: 1,
    outputs: 2,
    category: 'action',
  },
  {
    type: 'end',
    label: 'End Call',
    description: 'Terminate the conversation',
    icon: 'PhoneOff',
    color: '#ef4444',
    inputs: 1,
    outputs: 0,
    category: 'exit',
  },
];

// =============================================
// Default Node Data Factory
// =============================================

export function createDefaultNodeData(type: NodeType): NodeData {
  switch (type) {
    case 'start':
      return {
        type: 'start',
        label: 'Start',
        greetingText: 'Hello! How can I help you today?',
        greetingType: 'text',
      };
    case 'aiResponse':
      return {
        type: 'aiResponse',
        label: 'AI Response',
        promptType: 'dynamic',
        temperature: 0.7,
      };
    case 'listen':
      return {
        type: 'listen',
        label: 'Listen',
        storeAs: 'user_input',
        timeout: 30,
        timeoutAction: 'repeat',
      };
    case 'branch':
      return {
        type: 'branch',
        label: 'Branch',
        conditionType: 'intent',
        intents: [],
        defaultOutput: 'default',
      };
    case 'transfer':
      return {
        type: 'transfer',
        label: 'Transfer',
        transferType: 'extension',
        destination: '',
        announceTo: 'none',
        failoverAction: 'end',
        timeout: 30,
      };
    case 'function':
      return {
        type: 'function',
        label: 'Function',
        functionType: 'builtin',
        onError: 'continue',
      };
    case 'collectInfo':
      return {
        type: 'collectInfo',
        label: 'Collect Info',
        fields: [],
        confirmAll: false,
        onComplete: 'continue',
      };
    case 'playAudio':
      return {
        type: 'playAudio',
        label: 'Play Audio',
        source: 'tts',
        ttsText: '',
        interruptible: true,
        dtmfEnabled: false,
      };
    case 'end':
      return {
        type: 'end',
        label: 'End Call',
        goodbyeType: 'text',
        goodbyeMessage: 'Thank you for calling. Goodbye!',
        outcome: 'completed',
      };
    default:
      throw new Error(`Unknown node type: ${type}`);
  }
}

// =============================================
// Flow Validation
// =============================================

export interface FlowValidationResult {
  valid: boolean;
  errors: FlowValidationError[];
  warnings: FlowValidationWarning[];
}

export interface FlowValidationError {
  nodeId?: string;
  message: string;
  type: 'missing_start' | 'missing_end' | 'orphan_node' | 'invalid_connection' | 'missing_config';
}

export interface FlowValidationWarning {
  nodeId?: string;
  message: string;
  type: 'no_fallback' | 'unreachable' | 'missing_timeout';
}

export function validateFlow(flow: FlowData): FlowValidationResult {
  const errors: FlowValidationError[] = [];
  const warnings: FlowValidationWarning[] = [];

  // Check for exactly one start node
  const startNodes = flow.nodes.filter(n => n.type === 'start');
  if (startNodes.length === 0) {
    errors.push({ message: 'Flow must have a Start node', type: 'missing_start' });
  } else if (startNodes.length > 1) {
    errors.push({ message: 'Flow can only have one Start node', type: 'missing_start' });
  }

  // Check for at least one end node
  const endNodes = flow.nodes.filter(n => n.type === 'end');
  if (endNodes.length === 0) {
    warnings.push({ message: 'Flow should have at least one End node', type: 'unreachable' });
  }

  // Check for orphan nodes (no incoming edges except start)
  const targetNodeIds = new Set(flow.edges.map(e => e.target));
  for (const node of flow.nodes) {
    if (node.type !== 'start' && !targetNodeIds.has(node.id)) {
      warnings.push({
        nodeId: node.id,
        message: `Node "${(node.data as { label?: string }).label || node.id}" has no incoming connections`,
        type: 'unreachable',
      });
    }
  }

  // Check for nodes with no outgoing edges (except end)
  const sourceNodeIds = new Set(flow.edges.map(e => e.source));
  for (const node of flow.nodes) {
    if (node.type !== 'end' && !sourceNodeIds.has(node.id)) {
      warnings.push({
        nodeId: node.id,
        message: `Node "${(node.data as { label?: string }).label || node.id}" has no outgoing connections`,
        type: 'no_fallback',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
