// ============================================
// Core Entity Types
// ============================================

export interface IVRMenu {
  id: string;
  name: string;
  welcomePromptId: string | null;
  invalidPromptId: string | null;
  timeoutPromptId: string | null;
  timeoutSeconds: number;
  maxRetries: number;
  createdAt: number;
}

export interface IVRMenuWithOptions extends IVRMenu {
  options: IVROption[];
}

export interface IVROption {
  id: string;
  menuId: string;
  keyPress: string;
  actionType: 'transfer' | 'submenu' | 'hangup' | 'voicemail' | 'queue' | 'external' | 'ring_group' | 'extension';
  destination: string | null;
  preConnectPromptId: string | null;
  postCallPromptId: string | null;
  transferTrunkId: string | null;
  transferDestination: string | null;
  transferMode: 'internal' | 'trunk';
}

export interface Extension {
  number: string;
  name: string;
  password: string;
  enabled: boolean;
  forwardNumber?: string | null;
  // Call Forwarding
  forwardEnabled?: boolean;
  forwardDestination?: string | null;
  forwardType?: 'always' | 'busy' | 'noanswer' | 'unavailable';
  forwardTimeout?: number;
  // Do Not Disturb
  dndEnabled?: boolean;
  createdAt: number;
}

export interface Prompt {
  id: string;
  name: string;
  type: 'tts' | 'uploaded';
  filePath: string | null;
  text: string | null;
  voice: string | null;
  createdAt: number;
}

export interface RoutingRule {
  id: string;
  did: string;
  targetType: 'ivr_menu' | 'extension' | 'queue' | 'ring_group';
  targetId: string;
  enabled: boolean;
  createdAt: number;
}

export interface CallLog {
  id: string;
  callerId: string | null;
  did: string | null;
  timestamp: number;
  ivrMenuId: string | null;
  optionsPressed: string;
  finalDestination: string | null;
  durationSeconds: number | null;
  disposition: string | null;
  uniqueId: string;
}

export interface AdminUser {
  telegramId: number;
  username: string | null;
  role: 'admin' | 'viewer';
  createdAt: number;
}

export interface SIPTrunk {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  authUsername: string | null;
  fromUser: string | null;
  fromDomain: string | null;
  context: string;
  codecs: string;
  enabled: boolean;
  register: boolean;
  stirShakenEnabled: boolean;
  stirShakenAttest: 'A' | 'B' | 'C' | null;
  stirShakenProfile: string | null;
  createdAt: number;
}

// ============================================
// Configuration Types
// ============================================

export interface AppConfig {
  asteriskAmiHost: string;
  asteriskAmiPort: number;
  asteriskAmiUser: string;
  asteriskAmiSecret: string;
  agiServerPort: number;
  telegramBotToken: string;
  initialAdminId: number | null;
  elevenLabsApiKey: string | null;
  elevenLabsDefaultVoice: string;
  databasePath: string;
  audioFilesPath: string;
  asteriskConfigPath: string;
}

// ============================================
// AMI Types
// ============================================

export interface AMIEvent {
  event: string;
  channel?: string;
  uniqueid?: string;
  calleridnum?: string;
  calleridname?: string;
  exten?: string;
  context?: string;
  connectedlinenum?: string;
  cause?: string;
  causeTxt?: string;
  digit?: string;
  [key: string]: string | undefined;
}

export interface AMIConfig {
  host: string;
  port: number;
  user: string;
  secret: string;
}

// ============================================
// AGI Types
// ============================================

export interface AGISession {
  channel: string;
  uniqueId: string;
  callerId: string;
  callerIdName: string;
  dnid: string;
  context: string;
  extension: string;
  variables: Map<string, string>;
}

export interface AGIResponse {
  code: number;
  result: string;
  data?: string;
}

// ============================================
// Telegram Session Types
// ============================================

export interface SessionData {
  currentMenu?: string;
  editingItemId?: string;
  editingItemType?: 'ivr' | 'extension' | 'routing' | 'prompt';
  awaitingInput?: string;
  tempData?: Record<string, unknown>;
}

// ============================================
// Statistics Types
// ============================================

export interface CallStats {
  totalCalls: number;
  answeredCalls: number;
  abandonedCalls: number;
  averageDuration: number;
  callsByHour: Record<number, number>;
  callsByMenu: Record<string, number>;
  dtmfDistribution: Record<string, number>;
}

export interface DailyStats {
  date: string;
  totalCalls: number;
  answeredCalls: number;
  abandonedCalls: number;
  optionBreakdown: Record<string, number>;
}

// ============================================
// ElevenLabs Types
// ============================================

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
}

export interface TTSRequest {
  text: string;
  voice: string;
  promptId: string;
  promptName: string;
}

// ============================================
// Service Result Types
// ============================================

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AudioConversionResult {
  originalPath: string;
  wavPath: string;
  slnPath: string;
  asteriskPath: string;
}

// ============================================
// Dialer Campaign Types
// ============================================

export type CampaignStatus = 'paused' | 'running' | 'completed';

export type CampaignHandlerType = 'ivr' | 'ai_agent' | 'ring_group' | 'extension';

export interface DialerCampaign {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  handlerType: CampaignHandlerType;
  ivrMenuId: string | null;
  aiAgentId: string | null;
  ringGroupId: string | null;
  targetExtensions: string | null;
  holdMusicPromptId: string | null;
  trunkId: string | null;  // Trunk for outbound dialing
  transferTrunkId: string | null;
  transferDestination: string | null;
  transferMode: 'internal' | 'trunk';
  callerId: string | null;
  callsPerMinute: number;
  maxConcurrent: number;
  retryAttempts: number;
  retryDelayMinutes: number;
  totalContacts: number;
  dialedCount: number;
  answeredCount: number;
  press1Count: number;
  connectedCount: number;
  answeringMachineCount: number;
  amdEnabled: boolean;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export type ContactStatus = 'pending' | 'dialing' | 'answered' | 'press1' | 'connected' | 'no_answer' | 'busy' | 'failed' | 'dnc' | 'answering_machine';

export interface CampaignContact {
  id: string;
  campaignId: string;
  phoneNumber: string;
  name: string | null;
  status: ContactStatus;
  attempts: number;
  lastAttemptAt: number | null;
  answeredAt: number | null;
  callLogId: string | null;
  notes: string | null;
  amdDetected: boolean;
  amdStatus: string | null;
  createdAt: number;
}

export interface DialerCallResult {
  contactId: string;
  campaignId: string;
  status: ContactStatus;
  callLogId?: string;
}
