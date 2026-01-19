// Domain models for BotPBX Admin

export interface User {
  id: number;
  username: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  role: 'admin' | 'supervisor' | 'viewer';
  enabled: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
  lastLogin?: string | null;
  lastLoginAt?: number | null;
}

export interface Session {
  id: string;
  userId: number;
  token: string;
  expiresAt: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

export interface Extension {
  id: string;
  number: string;
  extension?: string; // Alias for number (deprecated)
  name: string;
  email?: string | null;
  password?: string;
  secret?: string;
  context?: string;
  callerIdName?: string | null;
  callerIdNum?: string | null;
  forwardNumber?: string | null;
  // Call Forwarding
  forwardEnabled?: boolean;
  forwardDestination?: string | null;
  forwardType?: 'always' | 'busy' | 'noanswer' | 'unavailable';
  forwardTimeout?: number;
  // Do Not Disturb
  dndEnabled?: boolean;
  enabled: boolean;
  createdAt?: string;
  updatedAt: string;
}

export interface Trunk {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authUsername: string | null;
  fromUser: string | null;
  fromDomain: string | null;
  context: string;
  codecs: string;
  enabled: boolean;
  register: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IVRMenu {
  id: string;
  name: string;
  welcomePromptId: string | null;
  invalidPromptId: string | null;
  timeoutPromptId: string | null;
  timeoutSeconds: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  options?: IVROption[];
}

export interface IVROption {
  id: string;
  menuId: string;
  keyPress: string;
  actionType: 'transfer' | 'submenu' | 'hangup' | 'voicemail' | 'queue' | 'ring_group' | 'call_queue' | 'external';
  destination: string | null;
  preConnectPromptId: string | null;
  postCallPromptId: string | null;
  transferTrunkId: string | null;
  transferDestination: string | null;
  transferMode: 'internal' | 'trunk';
}

export interface Prompt {
  id: string;
  name: string;
  type: 'tts' | 'file';
  text: string | null;
  filePath: string | null;
  voice: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoutingRule {
  id: string;
  did: string;
  targetType: 'ivr_menu' | 'extension' | 'queue' | 'ring_group' | 'call_queue';
  targetId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CampaignHandlerType = 'ivr' | 'ai_agent' | 'ring_group' | 'extension';

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
  handlerType: CampaignHandlerType;
  ivrMenuId: string | null;
  aiAgentId: string | null;
  ringGroupId: string | null;
  targetExtensions: string | null;
  trunkId: string | null;
  callerId: string | null;
  callsPerMinute: number;
  maxConcurrent: number;
  dialTimeout: number;
  retryAttempts: number;
  retryDelay: number;
  retryDelayMinutes: number;
  holdMusicPromptId: string | null;
  transferTrunkId: string | null;
  transferDestination: string | null;
  transferMode: 'internal' | 'trunk';
  amdEnabled: boolean;
  totalContacts: number;
  dialedCount: number;
  answeredCount: number;
  press1Count: number;
  connectedCount: number;
  answeringMachineCount: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CampaignContact {
  id: string;
  campaignId: string;
  phoneNumber: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  customData: Record<string, unknown> | null;
  status: 'pending' | 'dialing' | 'answered' | 'press1' | 'connected' | 'no_answer' | 'busy' | 'failed' | 'completed' | 'dnc' | 'answering_machine';
  attempts: number;
  lastAttempt: string | null;
  lastAttemptAt: number | null;
  answeredAt: number | null;
  callLogId: string | null;
  notes: string | null;
  amdDetected: boolean;
  amdStatus: string | null;
  result: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CallLog {
  id: string;
  uniqueId: string;
  callerId: string;
  did: string;
  timestamp: number;
  ivrMenuId: string | null;
  optionsPressed: string;
  finalDestination: string | null;
  durationSeconds: number;
  disposition: string;
}

export interface Recording {
  id: string;
  callId: string;
  filePath: string;
  fileName: string;
  format: string;
  duration: number;
  fileSize: number;
  callerId: string | null;
  destination: string | null;
  createdAt: string;
}

export interface ActiveCall {
  uniqueId: string;
  channel: string;
  callerId: string;
  callerName: string;
  destination: string;
  context: string;
  state: 'ringing' | 'up' | 'busy' | 'noanswer';
  startTime: number;
  answerTime: number | null;
  duration: number;
  bridgedTo: string | null;
  ivrMenuId: string | null;
  campaignId: string | null;
}

export interface SystemSettings {
  amiHost: string;
  amiPort: number;
  amiUsername: string;
  recordingPath: string;
  ttsEngine: string;
  ttsVoice: string;
}

// Analytics types
export interface DashboardStats {
  calls: {
    today: number;
    answered: number;
    abandoned: number;
    averageDuration: number;
  };
  recordings: {
    count: number;
    totalSize: number;
  };
  campaigns: {
    running: number;
    total: number;
  };
  system: {
    connectedClients: number;
    uptime: number;
  };
}

export interface HourlyCallData {
  hour: number;
  calls: number;
}

export interface DailyCallData {
  date: string;
  totalCalls: number;
  answeredCalls: number;
  abandonedCalls: number;
}

export interface DTMFData {
  key: string;
  count: number;
}

export interface CampaignPerformance {
  id: string;
  name: string;
  status: string;
  totalContacts: number;
  dialedCount: number;
  answeredCount: number;
  press1Count: number;
  connectedCount: number;
  answerRate: number;
  connectRate: number;
  pending: number;
  completed: number;
  failed: number;
}
