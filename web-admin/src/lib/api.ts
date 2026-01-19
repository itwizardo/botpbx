/**
 * API Client with authentication interceptor
 * Handles token refresh and error handling
 */

import type {
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  ExtensionsResponse,
  TrunksResponse,
  IVRMenusResponse,
  PromptsResponse,
  RoutingRulesResponse,
  CampaignsResponse,
  ContactsResponse,
  CallLogsResponse,
  RecordingsResponse,
  ActiveCallsResponse,
  DashboardResponse,
  HourlyCallsResponse,
  DailyCallsResponse,
  DTMFResponse,
  CampaignPerformanceResponse,
  UsersResponse,
  SystemStatusResponse,
  AuditLogsResponse,
} from '@/types/api';
import type { Extension, Trunk, IVRMenu, IVROption, RoutingRule, Campaign, User } from '@/types/models';

// Auto-detect API URL based on browser location
// Frontend runs on port 3001, backend on port 3000
function detectApiBaseUrl(): string {
  // Use env var if explicitly set and not localhost placeholder
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && !envUrl.includes('localhost')) {
    return envUrl;
  }

  // In browser, derive from current location
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:3000`;
  }

  // Server-side fallback
  return envUrl || 'http://localhost:3000';
}

const API_BASE = detectApiBaseUrl();

// Helper to get API base URL (re-detects each time for dynamic scenarios)
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:3000`;
  }
  return API_BASE;
}

// Token storage keys
const TOKEN_KEY = 'botpbx_token';
const REFRESH_TOKEN_KEY = 'botpbx_refresh_token';

// Get stored token
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

// Get stored refresh token
export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

// Store tokens
export function setTokens(token: string, refreshToken: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

// Clear tokens
export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// Check if token exists
export function hasToken(): boolean {
  return !!getToken();
}

// API Error class
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// Refresh token if expired
let refreshPromise: Promise<string> | null = null;

async function refreshTokenIfNeeded(): Promise<string | null> {
  const token = getToken();
  const refreshToken = getRefreshToken();

  if (!token || !refreshToken) {
    return null;
  }

  // Check if token is expired (decode JWT)
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp * 1000;

    // If token expires in less than 5 minutes, refresh it
    if (Date.now() > exp - 5 * 60 * 1000) {
      // Prevent multiple refresh calls
      if (!refreshPromise) {
        refreshPromise = (async () => {
          const response = await fetch(`${getApiBaseUrl()}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refreshToken }),
          });

          if (!response.ok) {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new Event('auth:unauthorized'));
            }
            clearTokens();
            throw new ApiError('Session expired', 401);
          }

          const data: RefreshResponse = await response.json();
          setTokens(data.token, refreshToken);
          return data.token;
        })().finally(() => {
          refreshPromise = null;
        });
      }

      return refreshPromise;
    }

    return token;
  } catch {
    return token;
  }
}

// Generic fetch wrapper with auth
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  requireAuth = true
): Promise<T> {
  const url = `${getApiBaseUrl()}${endpoint}`;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Only set Content-Type for requests with a body
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  if (requireAuth) {
    const token = await refreshTokenIfNeeded();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      throw new ApiError('Not authenticated', 401);
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle non-JSON responses
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    if (!response.ok) {
      throw new ApiError(response.statusText, response.status);
    }
    return {} as T;
  }

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
      clearTokens();
    }
    throw new ApiError(
      data.message || data.error || 'Request failed',
      response.status,
      data.code
    );
  }

  return data as T;
}

// ============================================
// Generic API helper for simple requests
// ============================================

export const api = {
  get: async <T = unknown>(endpoint: string): Promise<T> => {
    return apiFetch<T>(endpoint);
  },

  post: async <T = unknown>(endpoint: string, body?: unknown): Promise<T> => {
    return apiFetch<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : '{}',
    });
  },

  put: async <T = unknown>(endpoint: string, body?: unknown): Promise<T> => {
    return apiFetch<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : '{}',
    });
  },

  delete: async <T = unknown>(endpoint: string): Promise<T> => {
    return apiFetch<T>(endpoint, {
      method: 'DELETE',
      body: '{}',
    });
  },
};

// ============================================
// Auth API
// ============================================

export const authApi = {
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const data = await apiFetch<any>(
      '/api/v1/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(credentials),
      },
      false
    );
    // Backend returns accessToken, map it to token for consistency
    const token = data.accessToken || data.token;
    setTokens(token, data.refreshToken);
    return { ...data, token };
  },

  logout: async (): Promise<void> => {
    try {
      await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      clearTokens();
    }
  },

  me: async (): Promise<{ user: User }> => {
    return apiFetch('/api/v1/auth/me');
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await apiFetch('/api/v1/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  updateProfile: async (data: { displayName?: string; avatarUrl?: string }): Promise<{ user: User }> => {
    return apiFetch('/api/v1/auth/me/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

// ============================================
// Extensions API
// ============================================

export interface SipDetails {
  server: string;
  port: number;
  username: string;
  password: string;
}

export interface ExtensionWithSip extends Extension {
  sipDetails: SipDetails;
}

export const extensionsApi = {
  list: async (): Promise<ExtensionsResponse> => {
    return apiFetch('/api/v1/extensions');
  },

  get: async (id: string): Promise<Extension> => {
    return apiFetch(`/api/v1/extensions/${id}`);
  },

  create: async (data: { number: string; name: string }): Promise<ExtensionWithSip> => {
    return apiFetch('/api/v1/extensions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<Extension>): Promise<Extension> => {
    return apiFetch(`/api/v1/extensions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<void> => {
    await apiFetch(`/api/v1/extensions/${id}`, { method: 'DELETE', body: '{}' });
  },

  getSipDetails: async (number: string): Promise<{ extension: string; name: string; sipDetails: SipDetails }> => {
    return apiFetch(`/api/v1/extensions/${number}/sip-details`);
  },

  regeneratePassword: async (number: string): Promise<{ success: boolean; sipDetails: SipDetails }> => {
    return apiFetch(`/api/v1/extensions/${number}/regenerate-password`, {
      method: 'POST',
    });
  },
};

// ============================================
// Trunks API
// ============================================

export const trunksApi = {
  list: async (): Promise<TrunksResponse> => {
    return apiFetch('/api/v1/trunks');
  },

  get: async (id: string): Promise<Omit<Trunk, 'password'>> => {
    return apiFetch(`/api/v1/trunks/${id}`);
  },

  create: async (data: Partial<Trunk> & { password: string }): Promise<Omit<Trunk, 'password'>> => {
    return apiFetch('/api/v1/trunks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<Trunk>): Promise<Omit<Trunk, 'password'>> => {
    return apiFetch(`/api/v1/trunks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<void> => {
    await apiFetch(`/api/v1/trunks/${id}`, { method: 'DELETE', body: '{}' });
  },

  test: async (id: string): Promise<{
    success: boolean;
    trunk: string;
    dnsOk: boolean;
    portOk: boolean;
    sipOptionsOk: boolean;
    latencyMs: number;
    error?: string;
    details: {
      resolvedIp?: string;
      portCheckMs?: number;
      sipResponseCode?: number;
      sipResponseText?: string;
    };
  }> => {
    return apiFetch(`/api/v1/trunks/${id}/test`, { method: 'POST' });
  },

  quickCheck: async (id: string): Promise<{ ok: boolean; trunk: string; error?: string }> => {
    return apiFetch(`/api/v1/trunks/${id}/quick-check`, { method: 'POST' });
  },

  testCall: async (id: string, destination: string, callerId?: string): Promise<{
    success: boolean;
    message: string;
    destination: string;
    trunk: string;
    actionId?: string;
  }> => {
    return apiFetch(`/api/v1/trunks/${id}/test-call`, {
      method: 'POST',
      body: JSON.stringify({ destination, callerId }),
    });
  },
};

// ============================================
// IVR API
// ============================================

export const ivrApi = {
  listMenus: async (): Promise<IVRMenusResponse> => {
    return apiFetch('/api/v1/ivr/menus');
  },

  getMenu: async (id: string): Promise<IVRMenu> => {
    return apiFetch(`/api/v1/ivr/menus/${id}`);
  },

  createMenu: async (data: Partial<IVRMenu>): Promise<IVRMenu> => {
    return apiFetch('/api/v1/ivr/menus', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateMenu: async (id: string, data: Partial<IVRMenu>): Promise<IVRMenu> => {
    return apiFetch(`/api/v1/ivr/menus/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteMenu: async (id: string): Promise<void> => {
    await apiFetch(`/api/v1/ivr/menus/${id}`, { method: 'DELETE', body: '{}' });
  },

  addOption: async (menuId: string, data: Partial<IVROption>): Promise<IVROption> => {
    return apiFetch(`/api/v1/ivr/menus/${menuId}/options`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateOption: async (id: string, data: Partial<IVROption>): Promise<void> => {
    await apiFetch(`/api/v1/ivr/options/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteOption: async (id: string): Promise<void> => {
    await apiFetch(`/api/v1/ivr/options/${id}`, { method: 'DELETE', body: '{}' });
  },

  listPrompts: async (): Promise<PromptsResponse> => {
    return apiFetch('/api/v1/ivr/prompts');
  },

  listRouting: async (): Promise<RoutingRulesResponse> => {
    return apiFetch('/api/v1/ivr/routing');
  },

  createRouting: async (data: Partial<RoutingRule>): Promise<RoutingRule> => {
    return apiFetch('/api/v1/ivr/routing', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateRouting: async (id: string, data: Partial<RoutingRule>): Promise<RoutingRule> => {
    return apiFetch(`/api/v1/ivr/routing/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteRouting: async (id: string): Promise<void> => {
    await apiFetch(`/api/v1/ivr/routing/${id}`, { method: 'DELETE', body: '{}' });
  },

  testMenu: async (menuId: string, options?: { extension?: string; phoneNumber?: string; trunkId?: string }): Promise<{
    success: boolean;
    message: string;
    menuId: string;
    menuName: string;
    extension?: string;
    options?: number;
    instructions?: string;
    actionId?: string;
  }> => {
    return apiFetch(`/api/v1/ivr/menus/${menuId}/test-call`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },
};

// ============================================
// Campaigns API
// ============================================

export const campaignsApi = {
  list: async (): Promise<CampaignsResponse> => {
    return apiFetch('/api/v1/campaigns');
  },

  get: async (id: string): Promise<Campaign> => {
    return apiFetch(`/api/v1/campaigns/${id}`);
  },

  create: async (data: Partial<Campaign>): Promise<Campaign> => {
    return apiFetch('/api/v1/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<Campaign>): Promise<Campaign> => {
    return apiFetch(`/api/v1/campaigns/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<void> => {
    await apiFetch(`/api/v1/campaigns/${id}`, { method: 'DELETE', body: '{}' });
  },

  start: async (id: string): Promise<void> => {
    await apiFetch(`/api/v1/campaigns/${id}/start`, { method: 'POST', body: '{}' });
  },

  pause: async (id: string): Promise<void> => {
    await apiFetch(`/api/v1/campaigns/${id}/pause`, { method: 'POST', body: '{}' });
  },

  resume: async (id: string): Promise<void> => {
    await apiFetch(`/api/v1/campaigns/${id}/resume`, { method: 'POST', body: '{}' });
  },

  stop: async (id: string): Promise<void> => {
    await apiFetch(`/api/v1/campaigns/${id}/stop`, { method: 'POST', body: '{}' });
  },

  listContacts: async (id: string, page = 1, pageSize = 50): Promise<ContactsResponse> => {
    return apiFetch(`/api/v1/campaigns/${id}/contacts?page=${page}&pageSize=${pageSize}`);
  },

  uploadContacts: async (id: string, contacts: Array<{ phoneNumber: string; firstName?: string; lastName?: string }>): Promise<{ imported: number }> => {
    return apiFetch(`/api/v1/campaigns/${id}/contacts`, {
      method: 'POST',
      body: JSON.stringify({ contacts }),
    });
  },
};

// ============================================
// Calls API
// ============================================

export const callsApi = {
  listActive: async (): Promise<ActiveCallsResponse> => {
    return apiFetch('/api/v1/calls/active');
  },

  listLogs: async (page = 1, pageSize = 50, filters?: Record<string, string>): Promise<CallLogsResponse> => {
    const offset = (page - 1) * pageSize;
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
    }
    return apiFetch(`/api/v1/calls/logs?${params}`);
  },

  get: async (id: string): Promise<{ call: Record<string, unknown> }> => {
    return apiFetch(`/api/v1/calls/logs/${id}`);
  },

  spy: async (channel: string, extension?: string): Promise<void> => {
    await apiFetch('/api/v1/calls/spy', {
      method: 'POST',
      body: JSON.stringify({ channel, extension }),
    });
  },

  hangup: async (channel: string): Promise<void> => {
    await apiFetch('/api/v1/calls/hangup', {
      method: 'POST',
      body: JSON.stringify({ channel }),
    });
  },
};

// ============================================
// Recordings API
// ============================================

export const recordingsApi = {
  list: async (page = 1, pageSize = 50): Promise<RecordingsResponse> => {
    const offset = (page - 1) * pageSize;
    return apiFetch(`/api/v1/recordings?limit=${pageSize}&offset=${offset}`);
  },

  get: async (id: string): Promise<{ recording: Record<string, unknown> }> => {
    return apiFetch(`/api/v1/recordings/${id}`);
  },

  delete: async (id: string): Promise<void> => {
    await apiFetch(`/api/v1/recordings/${id}`, { method: 'DELETE', body: '{}' });
  },

  getUrl: (id: string): string => {
    return `${getApiBaseUrl()}/api/v1/recordings/${id}/download`;
  },

  // Get transcription for a recording
  getTranscription: async (id: string): Promise<{
    transcription: Transcription | null;
    job: TranscriptionJob | null;
  }> => {
    return apiFetch(`/api/v1/recordings/${id}/transcription`);
  },

  // Trigger transcription for a recording
  transcribe: async (id: string, options?: {
    provider?: string;
    language?: string;
    priority?: number;
  }): Promise<{ success: boolean; job: { id: string; status: string; priority: number } }> => {
    return apiFetch(`/api/v1/recordings/${id}/transcribe`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },
};

// ============================================
// Transcriptions API
// ============================================

export interface Transcription {
  id: string;
  sourceType: 'recording' | 'voicemail' | 'conversation';
  sourceId: string;
  fullText: string;
  segments: string | null;
  languageDetected: string | null;
  confidence: number | null;
  provider: string;
  processingTimeMs: number | null;
  wordCount: number | null;
  durationSeconds: number | null;
  summary: string | null;
  keywords: string | null;
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  createdAt: number;
}

export interface TranscriptionJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  createdAt: number;
}

export interface TranscriptionStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  providersAvailable: string[];
  serviceRunning: boolean;
}

export const transcriptionsApi = {
  list: async (params?: {
    limit?: number;
    offset?: number;
    sourceType?: string;
  }): Promise<{
    transcriptions: Transcription[];
    pagination: { limit: number; offset: number; total: number; hasMore: boolean };
  }> => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    if (params?.sourceType) searchParams.set('sourceType', params.sourceType);
    const query = searchParams.toString();
    return apiFetch(`/api/v1/transcriptions${query ? `?${query}` : ''}`);
  },

  search: async (query: string, limit?: number): Promise<{
    results: Transcription[];
    query: string;
  }> => {
    const searchParams = new URLSearchParams({ q: query });
    if (limit) searchParams.set('limit', String(limit));
    return apiFetch(`/api/v1/transcriptions/search?${searchParams}`);
  },

  get: async (id: string): Promise<Transcription> => {
    return apiFetch(`/api/v1/transcriptions/${id}`);
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiFetch(`/api/v1/transcriptions/${id}`, {
      method: 'DELETE',
      body: '{}',
    });
  },

  getStats: async (): Promise<TranscriptionStats> => {
    return apiFetch('/api/v1/transcriptions/jobs/stats');
  },

  refreshProviders: async (): Promise<{ success: boolean; providersAvailable: string[] }> => {
    return apiFetch('/api/v1/transcriptions/service/refresh', {
      method: 'POST',
      body: '{}',
    });
  },

  cleanupJobs: async (daysOld?: number): Promise<{ success: boolean; deleted: number; message: string }> => {
    return apiFetch('/api/v1/transcriptions/jobs/cleanup', {
      method: 'POST',
      body: JSON.stringify({ daysOld }),
    });
  },
};

// ============================================
// Analytics API
// ============================================

export const analyticsApi = {
  dashboard: async (): Promise<DashboardResponse> => {
    return apiFetch('/api/v1/analytics/dashboard');
  },

  hourly: async (): Promise<HourlyCallsResponse> => {
    return apiFetch('/api/v1/analytics/calls/hourly');
  },

  daily: async (days = 7): Promise<DailyCallsResponse> => {
    return apiFetch(`/api/v1/analytics/calls/daily?days=${days}`);
  },

  dtmf: async (days = 7): Promise<DTMFResponse> => {
    return apiFetch(`/api/v1/analytics/calls/dtmf?days=${days}`);
  },

  campaignPerformance: async (): Promise<CampaignPerformanceResponse> => {
    return apiFetch('/api/v1/analytics/campaigns/performance');
  },
};

// ============================================
// Users API (Admin)
// ============================================

export interface UserPermission {
  permission: string;
  granted: boolean;
  isOverride: boolean;
}

export interface UserPermissionsResponse {
  userId: number;
  role: string;
  permissions: UserPermission[];
}

export const usersApi = {
  list: async (): Promise<UsersResponse> => {
    return apiFetch('/api/v1/settings/users');
  },

  get: async (id: number): Promise<User> => {
    return apiFetch(`/api/v1/settings/users/${id}`);
  },

  create: async (data: { username: string; password: string; role?: string; displayName?: string }): Promise<User> => {
    return apiFetch('/api/v1/settings/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: number, data: Partial<User & { password?: string }>): Promise<User> => {
    return apiFetch(`/api/v1/settings/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiFetch(`/api/v1/settings/users/${id}`, { method: 'DELETE', body: '{}' });
  },

  // Permissions
  getPermissions: async (id: number): Promise<UserPermissionsResponse> => {
    return apiFetch(`/api/v1/settings/users/${id}/permissions`);
  },

  updatePermissions: async (id: number, permissions: { permission: string; granted: boolean }[]): Promise<UserPermissionsResponse> => {
    return apiFetch(`/api/v1/settings/users/${id}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    });
  },

  resetPermissions: async (id: number): Promise<UserPermissionsResponse> => {
    return apiFetch(`/api/v1/settings/users/${id}/permissions`, {
      method: 'DELETE',
      body: '{}',
    });
  },

  getMyPermissions: async (): Promise<{ userId: number; role: string; permissions: string[] }> => {
    return apiFetch('/api/v1/settings/my-permissions');
  },
};

// ============================================
// Teams API
// ============================================

export interface Team {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  queueId: string | null;
  queueName: string | null;
  memberCount: number;
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  avatarUrl: string | null;
  role: 'admin' | 'supervisor' | 'viewer';
  enabled: boolean;
  lastLoginAt: number | null;
  teamRole: string;
  joinedAt: string;
}

export interface TeamStats {
  totalUsers: number;
  totalTeams: number;
  activeUsers: number;
  adminCount: number;
  supervisorCount: number;
  viewerCount: number;
}

export interface TeamsResponse {
  teams: Team[];
  stats: TeamStats;
  unassignedUsers: TeamMember[];
}

export interface Queue {
  id: string;
  name: string;
}

export const teamsApi = {
  list: async (): Promise<TeamsResponse> => {
    return apiFetch('/api/v1/teams');
  },

  get: async (id: string): Promise<{ team: Team }> => {
    return apiFetch(`/api/v1/teams/${id}`);
  },

  create: async (data: { name: string; description?: string; color?: string; queueId?: string | null }): Promise<Team> => {
    return apiFetch('/api/v1/teams', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: { name?: string; description?: string; color?: string; queueId?: string | null }): Promise<Team> => {
    return apiFetch(`/api/v1/teams/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<void> => {
    await apiFetch(`/api/v1/teams/${id}`, { method: 'DELETE', body: '{}' });
  },

  addMember: async (teamId: string, userId: number, role?: string): Promise<void> => {
    await apiFetch(`/api/v1/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    });
  },

  removeMember: async (teamId: string, userId: number): Promise<void> => {
    await apiFetch(`/api/v1/teams/${teamId}/members/${userId}`, { method: 'DELETE', body: '{}' });
  },

  getQueues: async (): Promise<{ queues: Queue[] }> => {
    return apiFetch('/api/v1/queues');
  },
};

// ============================================
// System API
// ============================================

export interface UpdateCheckResponse {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  releaseNotes: string | null;
  publishedAt: string | null;
}

export interface UpdateTriggerResponse {
  success: boolean;
  message: string;
}

export interface AutoUpdateResponse {
  enabled: boolean;
}

export const systemApi = {
  status: async (): Promise<SystemStatusResponse> => {
    return apiFetch('/api/v1/system/status');
  },

  asteriskReload: async (): Promise<void> => {
    await apiFetch('/api/v1/system/asterisk/reload', { method: 'POST' });
  },

  auditLogs: async (page = 1, pageSize = 50): Promise<AuditLogsResponse> => {
    return apiFetch(`/api/v1/system/audit?page=${page}&pageSize=${pageSize}`);
  },

  checkUpdates: async (): Promise<UpdateCheckResponse> => {
    return apiFetch('/api/v1/system/updates/check');
  },

  triggerUpdate: async (): Promise<UpdateTriggerResponse> => {
    return apiFetch('/api/v1/system/updates/trigger', { method: 'POST' });
  },

  getAutoUpdate: async (): Promise<AutoUpdateResponse> => {
    return apiFetch('/api/v1/system/updates/auto-update');
  },

  setAutoUpdate: async (enabled: boolean): Promise<AutoUpdateResponse> => {
    return apiFetch('/api/v1/system/updates/auto-update', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    });
  },
};

// ============================================
// Settings API
// ============================================

export interface PiperVoice {
  id: string;
  name: string;
  language: string;
  gender: string;
  quality: string;
}

export type TTSProvider = 'piper' | 'kokoro' | 'elevenlabs' | 'openai' | 'cartesia' | 'deepgram' | 'playht' | 'google';

export interface TTSSettings {
  provider: TTSProvider;
  piperUrl: string;
  piperVoice: string;
  elevenLabsVoice: string;
  hasElevenLabsKey: boolean;
  openaiVoice: string;
  hasOpenAIKey: boolean;
  cartesiaVoice: string;
  hasCartesiaKey: boolean;
  deepgramVoice: string;
  hasDeepgramKey: boolean;
  playhtVoice: string;
  hasPlayHTKey: boolean;
  googleVoice: string;
  hasGoogleKey: boolean;
}

export interface OpenAIVoice {
  id: string;
  name: string;
  description: string;
}

export interface TTSHealth {
  provider: string;
  status: 'online' | 'offline' | 'not_configured' | 'error';
  voicesCount?: number;
  error?: string;
}

export const settingsApi = {
  get: async (): Promise<Record<string, string>> => {
    const result = await apiFetch('/api/v1/settings') as { settings: Record<string, string> };
    return result.settings;
  },

  update: async (settings: Record<string, string>): Promise<void> => {
    await apiFetch('/api/v1/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  // TTS Settings
  getTTS: async (): Promise<TTSSettings> => {
    return apiFetch('/api/v1/settings/tts');
  },

  updateTTS: async (settings: Partial<{
    provider: TTSProvider;
    piperUrl: string;
    piperVoice: string;
    elevenLabsApiKey: string;
    elevenLabsVoice: string;
    openaiVoice: string;
    cartesiaVoice: string;
    deepgramVoice: string;
    playhtVoice: string;
    googleVoice: string;
  }>): Promise<{ success: boolean; provider: string }> => {
    return apiFetch('/api/v1/settings/tts', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  getTTSVoices: async (provider?: string): Promise<{ provider: string; voices: PiperVoice[] | OpenAIVoice[] }> => {
    const url = provider ? `/api/v1/settings/tts/voices?provider=${provider}` : '/api/v1/settings/tts/voices';
    return apiFetch(url);
  },

  getTTSHealth: async (): Promise<TTSHealth> => {
    return apiFetch('/api/v1/settings/tts/health');
  },

  generatePreview: async (text?: string, voice?: string, provider?: string, language?: string): Promise<{ success: boolean; previewId: string }> => {
    return apiFetch('/api/v1/settings/tts/preview', {
      method: 'POST',
      body: JSON.stringify({ text, voice, provider, language }),
    });
  },

  getPreviewUrl: (previewId: string): string => {
    return `${getApiBaseUrl()}/api/v1/settings/tts/preview/${previewId}`;
  },

  // Call Recording Settings
  getRecording: async (): Promise<{ enabled: boolean; recordingsPath: string }> => {
    return apiFetch('/api/v1/settings/recording');
  },

  toggleRecording: async (): Promise<{ enabled: boolean; message: string }> => {
    return apiFetch('/api/v1/settings/recording/toggle', {
      method: 'POST',
    });
  },
};

// Ring Groups
export interface RingGroup {
  id: string;
  name: string;
  strategy: 'ringall' | 'hunt' | 'random' | 'roundrobin';
  ringTime: number;
  failoverDestination: string | null;
  failoverType: 'voicemail' | 'extension' | 'ivr' | 'hangup';
  enabled: boolean;
  createdAt: number;
  members?: RingGroupMember[];
}

export interface RingGroupMember {
  id: string;
  ringGroupId: string;
  extensionNumber: string;
  extensionName?: string;
  priority: number;
}

export const ringGroupsApi = {
  list: async (): Promise<{ ringGroups: RingGroup[] }> => {
    return apiFetch('/api/v1/ring-groups');
  },

  get: async (id: string): Promise<RingGroup> => {
    return apiFetch(`/api/v1/ring-groups/${id}`);
  },

  create: async (data: {
    name: string;
    strategy?: RingGroup['strategy'];
    ringTime?: number;
    failoverDestination?: string;
    failoverType?: RingGroup['failoverType'];
    enabled?: boolean;
    members?: { number: string; priority: number }[];
  }): Promise<RingGroup> => {
    return apiFetch('/api/v1/ring-groups', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<{
    name: string;
    strategy: RingGroup['strategy'];
    ringTime: number;
    failoverDestination: string;
    failoverType: RingGroup['failoverType'];
    enabled: boolean;
    members: { number: string; priority: number }[];
  }>): Promise<RingGroup> => {
    return apiFetch(`/api/v1/ring-groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiFetch(`/api/v1/ring-groups/${id}`, { method: 'DELETE', body: '{}' });
  },
};

// Contacts
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
}

export interface ContactStats {
  total: number;
  active: number;
  dnc: number;
  invalid: number;
  archived: number;
}

export interface ImportResult {
  total: number;
  imported: number;
  duplicates: number;
  errors: number;
  errorDetails: string[];
}

export const contactsApi = {
  list: async (params?: {
    status?: string;
    tag?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ contacts: Contact[]; total: number }> => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.tag) searchParams.set('tag', params.tag);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    const query = searchParams.toString();
    return apiFetch(`/api/v1/contacts${query ? `?${query}` : ''}`);
  },

  get: async (id: string): Promise<Contact> => {
    return apiFetch(`/api/v1/contacts/${id}`);
  },

  getStats: async (): Promise<ContactStats> => {
    return apiFetch('/api/v1/contacts/stats');
  },

  create: async (data: {
    phoneNumber: string;
    name?: string;
    email?: string;
    company?: string;
    notes?: string;
    tags?: string;
    status?: Contact['status'];
  }): Promise<Contact> => {
    return apiFetch('/api/v1/contacts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<{
    phoneNumber: string;
    name: string;
    email: string;
    company: string;
    notes: string;
    tags: string;
    status: Contact['status'];
  }>): Promise<Contact> => {
    return apiFetch(`/api/v1/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiFetch(`/api/v1/contacts/${id}`, { method: 'DELETE', body: '{}' });
  },

  bulkDelete: async (ids: string[]): Promise<{ success: boolean; deleted: number }> => {
    return apiFetch('/api/v1/contacts/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  importCSV: async (data: string, options?: { skipDuplicates?: boolean; updateExisting?: boolean }): Promise<ImportResult> => {
    return apiFetch('/api/v1/contacts/import/csv', {
      method: 'POST',
      body: JSON.stringify({ data, ...options }),
    });
  },

  importText: async (data: string): Promise<ImportResult> => {
    return apiFetch('/api/v1/contacts/import/text', {
      method: 'POST',
      body: JSON.stringify({ data }),
    });
  },

  exportCSV: async (): Promise<string> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${getApiBaseUrl()}/api/v1/contacts/export/csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error('Failed to export contacts');
    }

    return response.text();
  },

  markDNC: async (id: string): Promise<Contact> => {
    return apiFetch(`/api/v1/contacts/${id}/dnc`, { method: 'POST', body: '{}' });
  },
};



// Prompts API (audio prompts for IVR, hold music, etc.)
export interface Prompt {
  id: string;
  name: string;
  type: 'tts' | 'uploaded';
  text: string | null;
  voice: string | null;
  filePath: string | null;
  createdAt: number;
}

export const promptsApi = {
  list: async (): Promise<{ prompts: Prompt[] }> => {
    return apiFetch('/api/v1/prompts');
  },

  get: async (id: string): Promise<Prompt> => {
    return apiFetch(`/api/v1/prompts/${id}`);
  },

  createTTS: async (data: { name: string; text: string; voice?: string; provider?: string; language?: string }): Promise<Prompt> => {
    return apiFetch('/api/v1/prompts/tts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  upload: async (file: File, name?: string): Promise<Prompt> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    const formData = new FormData();
    formData.append('file', file);
    if (name) {
      formData.append('name', name);
    }

    const response = await fetch(`${getApiBaseUrl()}/api/v1/prompts/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || 'Failed to upload file');
    }

    return response.json();
  },

  update: async (id: string, data: { name?: string; text?: string; voice?: string }): Promise<Prompt> => {
    return apiFetch(`/api/v1/prompts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiFetch(`/api/v1/prompts/${id}`, { method: 'DELETE', body: '{}' });
  },

  getAudioUrl: (id: string): string => {
    const token = getToken();
    return `${getApiBaseUrl()}/api/v1/prompts/${id}/audio?token=${token}`;
  },

  translate: async (text: string, targetLanguage: string): Promise<{ success: boolean; translatedText?: string; error?: string }> => {
    return apiFetch('/api/v1/prompts/translate', {
      method: 'POST',
      body: JSON.stringify({ text, targetLanguage }),
    });
  },
};

// ============================================
// Queues API
// ============================================

export interface QueueMember {
  id: string;
  queueId: string;
  extensionNumber: string;
  extensionName?: string;
  penalty: number;
  paused: boolean;
  createdAt: number;
}

export interface Queue {
  id: string;
  name: string;
  strategy: 'ringall' | 'hunt' | 'random' | 'roundrobin' | 'leastrecent';
  timeoutSeconds: number;
  retrySeconds: number;
  maxWaitTime: number;
  holdMusicPromptId: string | null;
  joinAnnouncementId: string | null;
  announceFrequency: number;
  announcePosition: number;
  enabled: boolean;
  createdAt: number;
  members?: QueueMember[];
  memberCount?: number;
}

export interface QueueStats {
  queueId: string;
  queueName: string;
  totalMembers: number;
  pausedMembers: number;
  activeMembers: number;
}

export const queuesApi = {
  list: async (): Promise<{ queues: Queue[] }> => {
    return apiFetch('/api/v1/queues');
  },

  get: async (id: string): Promise<Queue> => {
    return apiFetch(`/api/v1/queues/${id}`);
  },

  create: async (data: {
    name: string;
    strategy?: Queue['strategy'];
    timeoutSeconds?: number;
    retrySeconds?: number;
    maxWaitTime?: number;
    holdMusicPromptId?: string | null;
    joinAnnouncementId?: string | null;
    announceFrequency?: number;
    announcePosition?: number;
    enabled?: boolean;
    members?: { extensionNumber: string; penalty: number }[];
  }): Promise<Queue> => {
    return apiFetch('/api/v1/queues', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<{
    name: string;
    strategy: Queue['strategy'];
    timeoutSeconds: number;
    retrySeconds: number;
    maxWaitTime: number;
    holdMusicPromptId: string | null;
    joinAnnouncementId: string | null;
    announceFrequency: number;
    announcePosition: number;
    enabled: boolean;
    members: { extensionNumber: string; penalty: number }[];
  }>): Promise<Queue> => {
    return apiFetch(`/api/v1/queues/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiFetch(`/api/v1/queues/${id}`, { method: 'DELETE', body: '{}' });
  },

  // Member management
  addMember: async (queueId: string, extensionNumber: string, penalty?: number): Promise<QueueMember> => {
    return apiFetch(`/api/v1/queues/${queueId}/members`, {
      method: 'POST',
      body: JSON.stringify({ extensionNumber, penalty }),
    });
  },

  removeMember: async (queueId: string, extensionNumber: string): Promise<{ success: boolean }> => {
    return apiFetch(`/api/v1/queues/${queueId}/members/${extensionNumber}`, {
      method: 'DELETE',
      body: '{}',
    });
  },

  pauseMember: async (queueId: string, extensionNumber: string): Promise<{ success: boolean; paused: boolean }> => {
    return apiFetch(`/api/v1/queues/${queueId}/members/${extensionNumber}/pause`, {
      method: 'POST',
      body: '{}',
    });
  },

  unpauseMember: async (queueId: string, extensionNumber: string): Promise<{ success: boolean; paused: boolean }> => {
    return apiFetch(`/api/v1/queues/${queueId}/members/${extensionNumber}/unpause`, {
      method: 'POST',
      body: '{}',
    });
  },

  updateMemberPenalty: async (queueId: string, extensionNumber: string, penalty: number): Promise<{ success: boolean; penalty: number }> => {
    return apiFetch(`/api/v1/queues/${queueId}/members/${extensionNumber}`, {
      method: 'PUT',
      body: JSON.stringify({ penalty }),
    });
  },

  getStats: async (id: string): Promise<QueueStats> => {
    return apiFetch(`/api/v1/queues/${id}/stats`);
  },
};

// ============================================
// Outbound Routes API
// ============================================

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

export const outboundRoutesApi = {
  list: async (): Promise<{ routes: OutboundRoute[] }> => {
    return apiFetch('/api/v1/outbound-routes');
  },

  get: async (id: string): Promise<OutboundRoute> => {
    return apiFetch(`/api/v1/outbound-routes/${id}`);
  },

  create: async (data: {
    name: string;
    pattern: string;
    trunkId: string;
    priority?: number;
    prefixToAdd?: string;
    prefixToStrip?: number;
    callerId?: string;
    enabled?: boolean;
  }): Promise<OutboundRoute> => {
    return apiFetch('/api/v1/outbound-routes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<{
    name: string;
    pattern: string;
    trunkId: string;
    priority: number;
    prefixToAdd: string | null;
    prefixToStrip: number;
    callerId: string | null;
    enabled: boolean;
  }>): Promise<OutboundRoute> => {
    return apiFetch(`/api/v1/outbound-routes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiFetch(`/api/v1/outbound-routes/${id}`, { method: 'DELETE', body: '{}' });
  },

  reorder: async (routeIds: string[]): Promise<{ success: boolean }> => {
    return apiFetch('/api/v1/outbound-routes/reorder', {
      method: 'POST',
      body: JSON.stringify({ routeIds }),
    });
  },

  testMatch: async (number: string): Promise<{ number: string; matched: boolean; route: OutboundRoute | null }> => {
    return apiFetch('/api/v1/outbound-routes/test-match', {
      method: 'POST',
      body: JSON.stringify({ number }),
    });
  },
};

// ============================================
// AI Providers API
// ============================================

export interface AIProviderStatus {
  provider: string;
  type: 'llm' | 'stt' | 'tts';
  configured: boolean;
  status: 'online' | 'offline' | 'not_configured' | 'error';
  error?: string;
}

export interface AIProvidersConfig {
  llm: {
    openai: { configured: boolean; keyPrefix?: string };
    anthropic: { configured: boolean; keyPrefix?: string };
    groq: { configured: boolean; keyPrefix?: string };
  };
  stt: {
    deepgram: { configured: boolean; keyPrefix?: string };
    assemblyai: { configured: boolean; keyPrefix?: string };
  };
  tts: {
    elevenlabs: { configured: boolean; keyPrefix?: string };
    openai: { configured: boolean; keyPrefix?: string };
    cartesia: { configured: boolean; keyPrefix?: string };
    playht: { configured: boolean; keyPrefix?: string };
    google: { configured: boolean; keyPrefix?: string };
  };
}

export const aiProvidersApi = {
  getConfig: async (): Promise<AIProvidersConfig> => {
    return apiFetch('/api/v1/settings/ai-providers');
  },

  updateKey: async (provider: string, type: 'llm' | 'stt' | 'tts', apiKey: string): Promise<{ success: boolean; configured: boolean }> => {
    return apiFetch('/api/v1/settings/ai-providers/key', {
      method: 'PUT',
      body: JSON.stringify({ provider, type, apiKey }),
    });
  },

  testProvider: async (provider: string, type: 'llm' | 'stt' | 'tts'): Promise<AIProviderStatus> => {
    return apiFetch('/api/v1/settings/ai-providers/test', {
      method: 'POST',
      body: JSON.stringify({ provider, type }),
    });
  },

  removeKey: async (provider: string, type: 'llm' | 'stt' | 'tts'): Promise<{ success: boolean }> => {
    return apiFetch('/api/v1/settings/ai-providers/key', {
      method: 'DELETE',
      body: JSON.stringify({ provider, type }),
    });
  },
};

// ============================================
// Local TTS API
// ============================================

export interface LocalTtsStatus {
  piper: {
    installed: boolean;
    modelsCount: number;
    installedModels: string[];
    selectedVoice: string | null;
    available: boolean;
  };
  kokoro: {
    installed: boolean;
    modelsCount: number;
    installedModels: string[];
    selectedVoice: string | null;
    available: boolean;
  };
}

export interface LocalTtsProviderStatus {
  provider: string;
  installed: boolean;
  modelsCount: number;
  installedModels: string[];
  selectedVoice: string | null;
  availableModels: Array<{
    id: string;
    name: string;
    language: string;
    quality: string;
    sizeBytes: number;
    installed?: boolean;
  }>;
}

export const localTtsApi = {
  getStatus: async (): Promise<LocalTtsStatus> => {
    return apiFetch('/api/v1/local-tts/status');
  },

  getProviderStatus: async (provider: string): Promise<LocalTtsProviderStatus> => {
    return apiFetch(`/api/v1/local-tts/${provider}/status`);
  },

  getModels: async (provider: string): Promise<{ provider: string; models: Array<{ id: string; name: string; language: string; quality: string; sizeBytes: number; installed: boolean }> }> => {
    return apiFetch(`/api/v1/local-tts/${provider}/models`);
  },

  installModels: async (provider: string, modelIds: string[]): Promise<{ success: boolean; message: string; installedModels: string[]; newlyInstalled: string[] }> => {
    return apiFetch(`/api/v1/local-tts/${provider}/install`, {
      method: 'POST',
      body: JSON.stringify({ modelIds }),
    });
  },

  uninstallModel: async (provider: string, modelId: string): Promise<{ success: boolean; message: string; installedModels: string[] }> => {
    return apiFetch(`/api/v1/local-tts/${provider}/models/${modelId}`, {
      method: 'DELETE',
    });
  },

  setVoice: async (provider: string, modelId: string): Promise<{ success: boolean; selectedVoice: string }> => {
    return apiFetch(`/api/v1/local-tts/${provider}/voice`, {
      method: 'PUT',
      body: JSON.stringify({ modelId }),
    });
  },

  testVoice: async (provider: string, modelId: string, text?: string): Promise<{ success: boolean; provider: string; model: string; text: string; previewId: string; message: string }> => {
    return apiFetch('/api/v1/local-tts/test', {
      method: 'POST',
      body: JSON.stringify({ provider, modelId, text }),
    });
  },
};

// ============================================
// Twilio API
// ============================================

export interface TwilioPhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
  sid: string;
}

export interface TwilioTrunkConfig {
  termination: {
    host: string;
    port: number;
  };
  origination: {
    host: string;
  };
  credentials: {
    username: string;
    password: string;
  };
  codecs: string[];
}

export interface TwilioStirShaken {
  enabled: boolean;
  attestationLevel: 'A' | 'B' | 'C';
  verifiedNumbers: string[];
}

export interface TwilioValidationResult {
  valid: boolean;
  accountName?: string;
  accountType?: string;
  error?: string;
}

export interface TwilioWizardData {
  valid: boolean;
  accountName?: string;
  accountType?: string;
  phoneNumbers: TwilioPhoneNumber[];
  trunkConfig: TwilioTrunkConfig;
  stirShaken: TwilioStirShaken;
}

export const twilioApi = {
  validate: async (accountSid: string, authToken: string): Promise<TwilioValidationResult> => {
    return apiFetch('/api/v1/twilio/validate', {
      method: 'POST',
      body: JSON.stringify({ accountSid, authToken }),
    });
  },

  getPhoneNumbers: async (accountSid: string, authToken: string): Promise<{ numbers: TwilioPhoneNumber[] }> => {
    return apiFetch('/api/v1/twilio/phone-numbers', {
      method: 'POST',
      body: JSON.stringify({ accountSid, authToken }),
    });
  },

  getTrunkConfig: async (accountSid: string, authToken: string): Promise<TwilioTrunkConfig> => {
    return apiFetch('/api/v1/twilio/trunk-config', {
      method: 'POST',
      body: JSON.stringify({ accountSid, authToken }),
    });
  },

  getStirShaken: async (accountSid: string, authToken: string): Promise<TwilioStirShaken> => {
    return apiFetch('/api/v1/twilio/stir-shaken', {
      method: 'POST',
      body: JSON.stringify({ accountSid, authToken }),
    });
  },

  getWizardData: async (accountSid: string, authToken: string): Promise<TwilioWizardData> => {
    return apiFetch('/api/v1/twilio/wizard-data', {
      method: 'POST',
      body: JSON.stringify({ accountSid, authToken }),
    });
  },

  createTrunk: async (data: {
    accountSid: string;
    authToken: string;
    name: string;
    selectedNumbers?: string[];
    enableStirShaken?: boolean;
    useTls?: boolean;
  }): Promise<{
    success: boolean;
    trunk: Omit<Trunk, 'password'>;
    twilioAccount?: string;
    selectedNumbers: string[];
  }> => {
    return apiFetch('/api/v1/twilio/create-trunk', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getAvailableNumbers: async (
    accountSid: string,
    authToken: string,
    options?: {
      countryCode?: string;
      areaCode?: string;
      type?: 'local' | 'tollFree';
      limit?: number;
    }
  ): Promise<{ numbers: TwilioPhoneNumber[] }> => {
    return apiFetch('/api/v1/twilio/available-numbers', {
      method: 'POST',
      body: JSON.stringify({ accountSid, authToken, ...options }),
    });
  },
};

// ============================================
// Voicemails API
// ============================================

export interface Voicemail {
  id: string;
  mailbox: string;
  callerId: string | null;
  callerName: string | null;
  durationSeconds: number | null;
  filePath: string;
  transcriptionId: string | null;
  read: boolean;
  notified: boolean;
  urgent: boolean;
  msgId: string | null;
  origDate: string | null;
  origTime: string | null;
  createdAt: number;
}

export interface VoicemailStats {
  total: number;
  unread: number;
  read: number;
  transcribed: number;
  unreadByMailbox: Record<string, number>;
}

export const voicemailsApi = {
  list: async (params?: {
    limit?: number;
    offset?: number;
    mailbox?: string;
    unread?: boolean;
  }): Promise<{
    voicemails: Voicemail[];
    pagination: { limit: number; offset: number; total: number; hasMore: boolean };
  }> => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    if (params?.mailbox) searchParams.set('mailbox', params.mailbox);
    if (params?.unread) searchParams.set('unread', 'true');
    const query = searchParams.toString();
    return apiFetch(`/api/v1/voicemails${query ? `?${query}` : ''}`);
  },

  get: async (id: string): Promise<{
    voicemail: Voicemail;
    transcription: Transcription | null;
    job: TranscriptionJob | null;
  }> => {
    return apiFetch(`/api/v1/voicemails/${id}`);
  },

  getStats: async (): Promise<VoicemailStats> => {
    return apiFetch('/api/v1/voicemails/stats');
  },

  markAsRead: async (id: string): Promise<{ success: boolean; read: boolean }> => {
    return apiFetch(`/api/v1/voicemails/${id}/read`, {
      method: 'PUT',
      body: '{}',
    });
  },

  markAsUnread: async (id: string): Promise<{ success: boolean; read: boolean }> => {
    return apiFetch(`/api/v1/voicemails/${id}/unread`, {
      method: 'PUT',
      body: '{}',
    });
  },

  transcribe: async (id: string, options?: {
    provider?: string;
    language?: string;
  }): Promise<{ success: boolean; job: { id: string; status: string; priority: number } }> => {
    return apiFetch(`/api/v1/voicemails/${id}/transcribe`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiFetch(`/api/v1/voicemails/${id}`, {
      method: 'DELETE',
      body: '{}',
    });
  },

  scan: async (): Promise<{ success: boolean; scanned: number; message: string }> => {
    return apiFetch('/api/v1/voicemails/scan', {
      method: 'POST',
      body: '{}',
    });
  },

  getStreamUrl: (id: string): string => {
    return `${getApiBaseUrl()}/api/v1/voicemails/${id}/stream`;
  },

  getDownloadUrl: (id: string): string => {
    return `${getApiBaseUrl()}/api/v1/voicemails/${id}/download`;
  },
};

// ============================================
// AI Analytics API
// ============================================

export interface AIConversationStats {
  totalConversations: number;
  completedConversations: number;
  failedConversations: number;
  transferredConversations: number;
  averageDurationSeconds: number;
  averageTurns: number;
  successRate: number;
}

export interface SentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
  mixed: number;
  unknown: number;
}

export interface OutcomeDistribution {
  completed: number;
  transferred: number;
  abandoned: number;
  failed: number;
  other: number;
}

export interface LatencyMetrics {
  avgSttLatencyMs: number;
  avgLlmLatencyMs: number;
  avgTtsLatencyMs: number;
  avgTotalLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}

export interface AgentStats {
  agentId: string;
  agentName: string;
  totalCalls: number;
  completedCalls: number;
  successRate: number;
  averageDurationSeconds: number;
  averageTurns: number;
  sentimentBreakdown: SentimentBreakdown;
}

export interface DailyStats {
  date: string;
  totalCalls: number;
  completedCalls: number;
  averageDurationSeconds: number;
}

export interface AIAnalyticsDashboard {
  stats: AIConversationStats;
  sentiment: SentimentBreakdown;
  outcomes: OutcomeDistribution;
  latency: LatencyMetrics;
  dailyStats: DailyStats[];
  topAgents: AgentStats[];
  recentConversations: Array<{
    id: string;
    agentName: string;
    callerNumber: string;
    state: string;
    sentiment: string | null;
    durationSeconds: number | null;
    startTime: number;
  }>;
}

export const aiAnalyticsApi = {
  getDashboard: async (days?: number): Promise<AIAnalyticsDashboard> => {
    const params = days ? `?days=${days}` : '';
    return apiFetch(`/api/v1/analytics/ai/dashboard${params}`);
  },

  getStats: async (startDate?: string, endDate?: string): Promise<AIConversationStats> => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const query = params.toString();
    return apiFetch(`/api/v1/analytics/ai/stats${query ? `?${query}` : ''}`);
  },

  getSentiment: async (startDate?: string, endDate?: string): Promise<SentimentBreakdown> => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const query = params.toString();
    return apiFetch(`/api/v1/analytics/ai/sentiment${query ? `?${query}` : ''}`);
  },

  getOutcomes: async (startDate?: string, endDate?: string): Promise<OutcomeDistribution> => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const query = params.toString();
    return apiFetch(`/api/v1/analytics/ai/outcomes${query ? `?${query}` : ''}`);
  },

  getLatency: async (startDate?: string, endDate?: string): Promise<LatencyMetrics> => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const query = params.toString();
    return apiFetch(`/api/v1/analytics/ai/latency${query ? `?${query}` : ''}`);
  },

  getAgentStats: async (startDate?: string, endDate?: string): Promise<{ agents: AgentStats[] }> => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const query = params.toString();
    return apiFetch(`/api/v1/analytics/ai/agents${query ? `?${query}` : ''}`);
  },

  getDailyStats: async (days?: number): Promise<{ dailyStats: DailyStats[] }> => {
    const params = days ? `?days=${days}` : '';
    return apiFetch(`/api/v1/analytics/ai/daily${params}`);
  },

  getRecentConversations: async (limit?: number): Promise<{
    conversations: Array<{
      id: string;
      agentId: string;
      agentName: string;
      callerNumber: string;
      direction: string;
      state: string;
      outcome: string | null;
      sentiment: string | null;
      durationSeconds: number | null;
      totalTurns: number | null;
      startTime: number;
    }>;
  }> => {
    const params = limit ? `?limit=${limit}` : '';
    return apiFetch(`/api/v1/analytics/ai/conversations/recent${params}`);
  },
};

// ============================================
// Call Summary API
// ============================================

export interface CallSummary {
  id: string;
  conversationId: string;
  summaryText: string;
  keyPoints: string[] | null;
  actionItems: string[] | null;
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed' | null;
  callerIntent: string | null;
  followUpNeeded: boolean;
  followUpNotes: string | null;
  generatedBy: string;
  modelUsed: string | null;
  tokensUsed: number | null;
  createdAt: number;
}

export interface ConversationTurn {
  id: string;
  turnNumber: number;
  role: 'user' | 'assistant' | 'system' | 'function';
  content: string;
  audioDurationMs: number | null;
  startedAt: number;
  functionName?: string;
  functionArgs?: string;
  functionResult?: string;
}

export interface ConversationData {
  id: string;
  agentId: string;
  agentName: string;
  callerNumber: string;
  calledNumber: string;
  direction: 'inbound' | 'outbound';
  state: string;
  outcome: string | null;
  startTime: number;
  endTime: number | null;
  durationSeconds: number | null;
  turns: ConversationTurn[];
  summary?: CallSummary | null;
}

export interface CallSummaryStats {
  total: number;
  followUpNeeded: number;
  bySentiment: {
    positive: number;
    neutral: number;
    negative: number;
    mixed: number;
  };
  avgTokensUsed: number;
}

export interface SummaryGenerationResult {
  success: boolean;
  summary?: CallSummary;
  error?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

export const callSummariesApi = {
  list: async (options?: {
    limit?: number;
    offset?: number;
    sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed';
    followUpNeeded?: boolean;
  }): Promise<{ summaries: CallSummary[]; total: number }> => {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.offset) params.set('offset', options.offset.toString());
    if (options?.sentiment) params.set('sentiment', options.sentiment);
    if (options?.followUpNeeded !== undefined) params.set('followUpNeeded', options.followUpNeeded.toString());
    const query = params.toString();
    return apiFetch(`/api/v1/call-summaries${query ? `?${query}` : ''}`);
  },

  get: async (id: string): Promise<CallSummary> => {
    return apiFetch(`/api/v1/call-summaries/${id}`);
  },

  getByConversationId: async (conversationId: string): Promise<CallSummary> => {
    return apiFetch(`/api/v1/call-summaries/conversation/${conversationId}`);
  },

  getConversationData: async (conversationId: string): Promise<ConversationData> => {
    return apiFetch(`/api/v1/call-summaries/conversation/${conversationId}/data`);
  },

  generate: async (conversationId: string): Promise<SummaryGenerationResult> => {
    return apiFetch(`/api/v1/call-summaries/conversation/${conversationId}/generate`, {
      method: 'POST',
      body: '{}',
    });
  },

  regenerate: async (conversationId: string): Promise<SummaryGenerationResult> => {
    return apiFetch(`/api/v1/call-summaries/conversation/${conversationId}/regenerate`, {
      method: 'POST',
      body: '{}',
    });
  },

  updateFollowUp: async (id: string, followUpNeeded: boolean, followUpNotes?: string): Promise<{ success: boolean }> => {
    return apiFetch(`/api/v1/call-summaries/${id}/follow-up`, {
      method: 'PUT',
      body: JSON.stringify({ followUpNeeded, followUpNotes }),
    });
  },

  getFollowUpRequired: async (limit?: number): Promise<CallSummary[]> => {
    const params = limit ? `?limit=${limit}` : '';
    return apiFetch(`/api/v1/call-summaries/follow-up-required${params}`);
  },

  getStats: async (): Promise<CallSummaryStats> => {
    return apiFetch('/api/v1/call-summaries/stats');
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiFetch(`/api/v1/call-summaries/${id}`, {
      method: 'DELETE',
      body: '{}',
    });
  },
};

// ============================================
// AI Insights API
// ============================================

export interface IntentDistribution {
  intent: string;
  count: number;
  percentage: number;
}

export interface FAQ {
  id: string;
  question: string;
  suggestedAnswer: string | null;
  frequency: number;
  category: string | null;
  lastSeen: number;
}

export interface AgentScoreData {
  agentId: string;
  agentName: string;
  overallScore: number;
  successScore: number;
  efficiencyScore: number;
  sentimentScore: number;
  resolutionScore: number;
  totalCalls: number;
  scoredCalls: number;
  lastUpdated: number;
}

export interface TopicInsight {
  topic: string;
  count: number;
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  relatedKeywords: string[];
}

export interface InsightsDashboard {
  intentDistribution: IntentDistribution[];
  topFAQs: FAQ[];
  agentScores: AgentScoreData[];
  topTopics: TopicInsight[];
  insightCounts: {
    intent: number;
    faq: number;
    agent_score: number;
    topic: number;
    keyword: number;
  };
}

export const aiInsightsApi = {
  getDashboard: async (): Promise<InsightsDashboard> => {
    return apiFetch('/api/v1/ai/insights/dashboard');
  },

  // Intents
  getIntents: async (days?: number): Promise<IntentDistribution[]> => {
    const params = days ? `?days=${days}` : '';
    return apiFetch(`/api/v1/ai/insights/intents${params}`);
  },

  classifyIntent: async (conversationId: string): Promise<{
    intent: string;
    confidence: number;
    subIntents: string[];
  }> => {
    return apiFetch(`/api/v1/ai/insights/intents/classify/${conversationId}`, {
      method: 'POST',
      body: '{}',
    });
  },

  // FAQs
  getFAQs: async (limit?: number): Promise<FAQ[]> => {
    const params = limit ? `?limit=${limit}` : '';
    return apiFetch(`/api/v1/ai/insights/faqs${params}`);
  },

  extractFAQs: async (conversationId: string): Promise<{ questions: Array<{ question: string; suggestedAnswer: string | null; category: string }> }> => {
    return apiFetch(`/api/v1/ai/insights/faqs/extract/${conversationId}`, {
      method: 'POST',
      body: '{}',
    });
  },

  updateFAQAnswer: async (id: string, suggestedAnswer: string): Promise<{ success: boolean }> => {
    return apiFetch(`/api/v1/ai/insights/faqs/${id}/answer`, {
      method: 'PUT',
      body: JSON.stringify({ suggestedAnswer }),
    });
  },

  // Agent Scores
  getAgentScores: async (): Promise<AgentScoreData[]> => {
    return apiFetch('/api/v1/ai/insights/agents/scores');
  },

  getAgentScore: async (agentId: string): Promise<AgentScoreData> => {
    return apiFetch(`/api/v1/ai/insights/agents/${agentId}/score`);
  },

  scoreAgent: async (agentId: string): Promise<AgentScoreData> => {
    return apiFetch(`/api/v1/ai/insights/agents/${agentId}/score`, {
      method: 'POST',
      body: '{}',
    });
  },

  scoreAllAgents: async (): Promise<{ scores: AgentScoreData[]; count: number }> => {
    return apiFetch('/api/v1/ai/insights/agents/score-all', {
      method: 'POST',
      body: '{}',
    });
  },

  // Topics
  getTopics: async (limit?: number): Promise<TopicInsight[]> => {
    const params = limit ? `?limit=${limit}` : '';
    return apiFetch(`/api/v1/ai/insights/topics${params}`);
  },

  extractTopics: async (conversationId: string): Promise<string[]> => {
    return apiFetch(`/api/v1/ai/insights/topics/extract/${conversationId}`, {
      method: 'POST',
      body: '{}',
    });
  },

  // Process conversation
  processConversation: async (conversationId: string): Promise<{ success: boolean }> => {
    return apiFetch(`/api/v1/ai/insights/process/${conversationId}`, {
      method: 'POST',
      body: '{}',
    });
  },
};

// AI Conversations API
export interface AIConversationListItem {
  id: string;
  ai_agent_id: string;
  agent_name: string;
  caller_number: string | null;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  state: 'active' | 'completed' | 'failed' | 'transferred' | 'abandoned';
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed' | null;
  turn_count: number;
}

export interface AIConversationsResponse {
  success: boolean;
  data: AIConversationListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const aiConversationsApi = {
  // List conversations with pagination
  list: async (page = 1, limit = 25, agentId?: string): Promise<AIConversationsResponse> => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (agentId) {
      params.set('agentId', agentId);
    }
    return apiFetch(`/api/v1/ai/conversations?${params.toString()}`);
  },

  // Get single conversation with turns
  get: async (id: string): Promise<{ success: boolean; data: unknown }> => {
    return apiFetch(`/api/v1/ai/conversations/${id}`);
  },
};

// ============================================
// AI Templates API
// ============================================

export interface AIAgentTemplate {
  id: string;
  name: string;
  category: string;
  description: string | null;
  systemPrompt: string;
  greetingText: string;
  voice: string;
  enabledFunctions: string[];
  icon: string | null;
  isDefault: boolean;
  createdAt: number;
}

export interface TemplateCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export const aiTemplatesApi = {
  // List all templates (optionally filtered by category)
  list: async (category?: string): Promise<{ success: boolean; data: AIAgentTemplate[] }> => {
    const params = category ? `?category=${category}` : '';
    return apiFetch(`/api/v1/ai/templates${params}`);
  },

  // Get available categories
  getCategories: async (): Promise<{ success: boolean; data: TemplateCategory[] }> => {
    return apiFetch('/api/v1/ai/templates/categories');
  },

  // Get single template
  get: async (id: string): Promise<{ success: boolean; data: AIAgentTemplate }> => {
    return apiFetch(`/api/v1/ai/templates/${id}`);
  },

  // Create agent from template
  createAgentFromTemplate: async (
    templateId: string,
    name: string,
    customizations?: {
      systemPrompt?: string;
      greetingText?: string;
      voice?: string;
      enabledFunctions?: string[];
    }
  ): Promise<{ success: boolean; data: unknown }> => {
    return apiFetch('/api/v1/ai/agents/from-template', {
      method: 'POST',
      body: JSON.stringify({ templateId, name, customizations }),
    });
  },
};

// ============================================
// Voice Preview API
// ============================================

export interface VoiceInfo {
  id: string;
  name: string;
  description: string;
  gender: string;
  style: string;
}

export interface VoiceSample {
  id: string;
  text: string;
}

export interface VoicePreviewResult {
  audio: string; // base64 data URL
  voice: string;
  text: string;
  durationEstimate: number;
}

export const voicePreviewApi = {
  // List available voices with metadata
  listVoices: async (): Promise<{ success: boolean; data: VoiceInfo[] }> => {
    return apiFetch('/api/v1/ai/voices');
  },

  // Get sample texts for voice preview
  getSamples: async (): Promise<{ success: boolean; data: VoiceSample[] }> => {
    return apiFetch('/api/v1/ai/voices/samples');
  },

  // Generate voice preview
  preview: async (voice: string, text?: string): Promise<{ success: boolean; data: VoicePreviewResult }> => {
    return apiFetch('/api/v1/ai/voices/preview', {
      method: 'POST',
      body: JSON.stringify({ voice, text }),
    });
  },

  // Compare multiple voices
  compare: async (voices: string[], text?: string): Promise<{
    success: boolean;
    data: {
      previews: Array<VoiceInfo & { audio: string | null; success: boolean; error?: string }>;
      text: string;
    };
  }> => {
    return apiFetch('/api/v1/ai/voices/compare', {
      method: 'POST',
      body: JSON.stringify({ voices, text }),
    });
  },
};

// ============================================
// AI Metrics API
// ============================================

export interface MetricsSummary {
  totalCalls: number;
  successfulCalls: number;
  successRate: number;
  avgDuration: number;
  avgSentiment: number;
  transferRate: number;
  totalCost: number;
}

export interface DailyMetric {
  date: string;
  totalCalls: number;
  successfulCalls: number;
  avgDuration: number;
  avgSentiment: number;
}

export interface AgentMetricsSummary {
  agentId: string;
  agentName: string;
  totalCalls: number;
  successfulCalls: number;
  successRate: number;
  avgDuration: number;
}

export interface FunctionUsage {
  name: string;
  count: number;
  successRate?: number;
}

export interface SentimentDistribution {
  sentiment: string;
  count: number;
}

export interface AgentDetailedMetrics {
  agentName: string;
  summary: {
    totalCalls: number;
    successfulCalls: number;
    successRate: number;
    avgDuration: number;
  };
  functionUsage: FunctionUsage[];
  sentimentDistribution: SentimentDistribution[];
}

export const aiMetricsApi = {
  // Get overall metrics summary
  getOverview: async (period?: string): Promise<{ success: boolean; data: MetricsSummary }> => {
    const params = period ? `?period=${period}` : '';
    return apiFetch(`/api/v1/ai/metrics/overview${params}`);
  },

  // Get daily metrics trend
  getDailyMetrics: async (period?: string, agentId?: string): Promise<{ success: boolean; data: DailyMetric[] }> => {
    const params = new URLSearchParams();
    if (period) params.set('period', period);
    if (agentId) params.set('agentId', agentId);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return apiFetch(`/api/v1/ai/metrics/daily${queryStr}`);
  },

  // Get all agents metrics comparison
  getAgentsMetrics: async (period?: string): Promise<{ success: boolean; data: AgentMetricsSummary[] }> => {
    const params = period ? `?period=${period}` : '';
    return apiFetch(`/api/v1/ai/metrics/agents${params}`);
  },

  // Get specific agent metrics
  getAgentMetrics: async (agentId: string, period?: string): Promise<{ success: boolean; data: AgentDetailedMetrics }> => {
    const params = period ? `?period=${period}` : '';
    return apiFetch(`/api/v1/ai/metrics/agents/${agentId}${params}`);
  },

  // Get top functions
  getTopFunctions: async (period?: string, limit?: number): Promise<{ success: boolean; data: FunctionUsage[] }> => {
    const params = new URLSearchParams();
    if (period) params.set('period', period);
    if (limit) params.set('limit', limit.toString());
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return apiFetch(`/api/v1/ai/metrics/top-functions${queryStr}`);
  },
};

// ============================================
// Contact Groups API
// ============================================

export interface ContactGroup {
  id: string;
  name: string;
  description?: string;
  memberCount: number;
  totalMembers?: number;
  uncalledCount?: number;
  calledCount?: number;
  dncCount?: number;
  allowRedial?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContactGroupMember {
  id: string;
  groupId: string;
  phoneNumber: string;
  name?: string;
  email?: string;
  metadata?: Record<string, string>;
  status: 'active' | 'dnc' | 'invalid';
  calledAt?: number | null;
  callResult?: string;
  createdAt: string;
}

export const contactGroupsApi = {
  list: async (): Promise<{ groups: ContactGroup[] }> => {
    return apiFetch('/api/v1/contact-groups');
  },

  get: async (id: string): Promise<ContactGroup> => {
    return apiFetch(`/api/v1/contact-groups/${id}`);
  },

  create: async (data: { name: string; description?: string; allowRedial?: boolean }): Promise<ContactGroup> => {
    return apiFetch('/api/v1/contact-groups', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: { name?: string; description?: string; allowRedial?: boolean }): Promise<ContactGroup> => {
    return apiFetch(`/api/v1/contact-groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiFetch(`/api/v1/contact-groups/${id}`, {
      method: 'DELETE',
    });
  },

  getMembers: async (groupId: string, filter?: string): Promise<{ members: ContactGroupMember[] }> => {
    const params = filter ? `?filter=${filter}` : '';
    return apiFetch(`/api/v1/contact-groups/${groupId}/members${params}`);
  },

  addMember: async (groupId: string, member: Partial<ContactGroupMember>): Promise<ContactGroupMember> => {
    return apiFetch(`/api/v1/contact-groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify(member),
    });
  },

  addMembersBulk: async (groupId: string, members: Partial<ContactGroupMember>[]): Promise<{ added: number; errors: number; skipped: number; message: string }> => {
    return apiFetch(`/api/v1/contact-groups/${groupId}/members/bulk`, {
      method: 'POST',
      body: JSON.stringify({ members }),
    });
  },

  removeMember: async (groupId: string, memberId: string): Promise<{ success: boolean }> => {
    return apiFetch(`/api/v1/contact-groups/${groupId}/members/${memberId}`, {
      method: 'DELETE',
    });
  },

  getDNCStats: async (): Promise<{ totalDNC: number; recentAdditions: number; totalCalled: number }> => {
    return apiFetch('/api/v1/contact-groups/dnc/stats');
  },

  exportForCampaign: async (groupId: string, excludeDNC?: boolean): Promise<{ contacts: any[]; count: number }> => {
    const params = excludeDNC ? '?excludeDNC=true' : '';
    return apiFetch(`/api/v1/contact-groups/${groupId}/export${params}`);
  },
};

// ============================================
// Global Search API
// ============================================

export interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  meta?: string;
  status?: 'online' | 'offline' | 'active' | 'inactive' | 'paused';
  url: string;
}

export interface SearchResponse {
  query: string;
  results: {
    extensions: SearchResult[];
    contacts: SearchResult[];
    trunks: SearchResult[];
    ivr: SearchResult[];
    prompts: SearchResult[];
    ringGroups: SearchResult[];
    queues: SearchResult[];
    aiAgents: SearchResult[];
    recordings: SearchResult[];
    campaigns: SearchResult[];
    pages: SearchResult[];
  };
  counts: {
    extensions: number;
    contacts: number;
    trunks: number;
    ivr: number;
    prompts: number;
    ringGroups: number;
    queues: number;
    aiAgents: number;
    recordings: number;
    campaigns: number;
    pages: number;
    total: number;
  };
}

export const searchApi = {
  search: async (query: string, options?: { types?: string[]; limit?: number }): Promise<SearchResponse> => {
    const params = new URLSearchParams({ q: query });
    if (options?.types?.length) {
      params.set('types', options.types.join(','));
    }
    if (options?.limit) {
      params.set('limit', options.limit.toString());
    }
    return apiFetch(`/api/v1/search?${params.toString()}`);
  },
};

// ============================================
// Public API (no auth required)
// ============================================

export const publicApi = {
  // Get documentation URL (public, no auth)
  getDocsUrl: async (): Promise<{ url: string | null }> => {
    return apiFetch('/api/v1/public/docs-url', {}, false);
  },
};
