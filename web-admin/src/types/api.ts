// API response types
import type {
  User,
  Extension,
  Trunk,
  IVRMenu,
  Prompt,
  RoutingRule,
  Campaign,
  CampaignContact,
  CallLog,
  Recording,
  ActiveCall,
  DashboardStats,
  HourlyCallData,
  DailyCallData,
  DTMFData,
  CampaignPerformance,
} from './models';

// Generic API response wrapper
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

// Auth responses
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: User;
  expiresIn: number;
  mustChangePassword?: boolean;
}

export interface RefreshResponse {
  token: string;
  expiresIn: number;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

// List responses
export interface ExtensionsResponse {
  extensions: Extension[];
}

export interface TrunksResponse {
  trunks: Omit<Trunk, 'password'>[];
}

export interface IVRMenusResponse {
  menus: IVRMenu[];
}

export interface PromptsResponse {
  prompts: Prompt[];
}

export interface RoutingRulesResponse {
  rules: RoutingRule[];
}

export interface CampaignsResponse {
  campaigns: Campaign[];
}

export interface ContactsResponse {
  contacts: CampaignContact[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CallLogsResponse {
  calls: CallLog[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RecordingsResponse {
  recordings: Recording[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ActiveCallsResponse {
  calls: ActiveCall[];
}

// Analytics responses
export interface DashboardResponse extends DashboardStats {}

export interface HourlyCallsResponse {
  data: HourlyCallData[];
}

export interface DailyCallsResponse {
  data: DailyCallData[];
}

export interface DTMFResponse {
  data: DTMFData[];
}

export interface CampaignPerformanceResponse {
  data: CampaignPerformance[];
}

// Users
export interface UsersResponse {
  users: User[];
}

// System
export interface SystemStatusResponse {
  status: string;
  uptime: number;
  uptimeHuman: string;
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
  system: {
    platform: string;
    arch: string;
    hostname: string;
    cpus: number;
    loadAvg: number[];
    freeMemory: number;
    totalMemory: number;
  };
  services: {
    asterisk: 'online' | 'offline' | 'unknown';
    asteriskVersion?: string;
    ami: 'connected' | 'disconnected';
    database: 'connected' | 'disconnected';
    databaseType?: string;
    websocket: string;
  };
}

export interface AuditLogEntry {
  id: number;
  userId: number;
  username: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditLogsResponse {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

// WebSocket message types
export interface WsMessage<T = unknown> {
  type: string;
  data: T;
  timestamp: number;
}

export interface WsCallStarted {
  uniqueId: string;
  channel: string;
  callerId: string;
  callerName: string;
  destination: string;
  context: string;
}

export interface WsCallAnswered {
  uniqueId: string;
  answerTime: number;
}

export interface WsCallEnded {
  uniqueId: string;
  duration: number;
  hangupCause: string;
}

export interface WsCallDTMF {
  uniqueId: string;
  digit: string;
}

export interface WsCampaignUpdate {
  campaignId: string;
  status: string;
  stats: {
    dialedCount: number;
    answeredCount: number;
    press1Count: number;
    connectedCount: number;
  };
}
