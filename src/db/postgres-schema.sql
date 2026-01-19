-- ===============================================
-- NovaPBX PostgreSQL Schema
-- Converted from SQLite migrations
-- ===============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===============================================
-- CORE TABLES
-- ===============================================

-- Settings table (key-value store for configuration)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admin users table (Telegram admins)
CREATE TABLE IF NOT EXISTS admin_users (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  role TEXT DEFAULT 'admin' CHECK(role IN ('admin', 'viewer')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Prompts table (TTS and uploaded audio files)
CREATE TABLE IF NOT EXISTS prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('tts', 'uploaded')),
  file_path TEXT,
  text TEXT,
  voice TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- IVR Menus table
CREATE TABLE IF NOT EXISTS ivr_menus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  welcome_prompt_id UUID REFERENCES prompts(id) ON DELETE SET NULL,
  invalid_prompt_id UUID REFERENCES prompts(id) ON DELETE SET NULL,
  timeout_prompt_id UUID REFERENCES prompts(id) ON DELETE SET NULL,
  timeout_seconds INTEGER DEFAULT 5,
  max_retries INTEGER DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- IVR Options table (DTMF key mappings)
CREATE TABLE IF NOT EXISTS ivr_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_id UUID NOT NULL REFERENCES ivr_menus(id) ON DELETE CASCADE,
  key_press TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK(action_type IN ('transfer', 'submenu', 'hangup', 'voicemail', 'queue', 'external')),
  destination TEXT,
  pre_connect_prompt_id UUID REFERENCES prompts(id) ON DELETE SET NULL,
  post_call_prompt_id UUID REFERENCES prompts(id) ON DELETE SET NULL,
  transfer_trunk_id TEXT,
  transfer_destination TEXT,
  transfer_mode TEXT DEFAULT 'internal',
  UNIQUE(menu_id, key_press)
);

-- Extensions table (PJSIP endpoints)
CREATE TABLE IF NOT EXISTS extensions (
  number TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Routing rules table (DID to IVR/extension mapping)
CREATE TABLE IF NOT EXISTS routing_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  did TEXT NOT NULL UNIQUE,
  target_type TEXT NOT NULL CHECK(target_type IN ('ivr_menu', 'extension', 'queue', 'ring_group')),
  target_id TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Call logs table
CREATE TABLE IF NOT EXISTS call_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  caller_id TEXT,
  did TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ivr_menu_id UUID REFERENCES ivr_menus(id) ON DELETE SET NULL,
  options_pressed TEXT,
  final_destination TEXT,
  duration_seconds INTEGER,
  disposition TEXT,
  unique_id TEXT
);

-- ===============================================
-- DIALER SYSTEM
-- ===============================================

-- SIP Trunks table
CREATE TABLE IF NOT EXISTS sip_trunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER DEFAULT 5060,
  username TEXT,
  password TEXT,
  auth_username TEXT,
  from_user TEXT,
  from_domain TEXT,
  context TEXT DEFAULT 'from-trunk',
  codecs TEXT DEFAULT 'ulaw,alaw',
  enabled BOOLEAN DEFAULT true,
  register BOOLEAN DEFAULT false,
  stir_shaken_enabled BOOLEAN DEFAULT false,
  stir_shaken_attest TEXT CHECK(stir_shaken_attest IS NULL OR stir_shaken_attest IN ('A', 'B', 'C')),
  stir_shaken_profile TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dialer Campaigns table
CREATE TABLE IF NOT EXISTS dialer_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'paused' CHECK(status IN ('paused', 'running', 'completed')),
  ivr_menu_id UUID REFERENCES ivr_menus(id) ON DELETE SET NULL,
  target_extensions TEXT,
  calls_per_minute INTEGER DEFAULT 2,
  max_concurrent INTEGER DEFAULT 3,
  retry_attempts INTEGER DEFAULT 1,
  retry_delay_minutes INTEGER DEFAULT 30,
  total_contacts INTEGER DEFAULT 0,
  dialed_count INTEGER DEFAULT 0,
  answered_count INTEGER DEFAULT 0,
  press1_count INTEGER DEFAULT 0,
  connected_count INTEGER DEFAULT 0,
  answering_machine_count INTEGER DEFAULT 0,
  amd_enabled BOOLEAN DEFAULT true,
  hold_music_prompt_id UUID REFERENCES prompts(id) ON DELETE SET NULL,
  transfer_trunk_id TEXT,
  transfer_destination TEXT,
  transfer_mode TEXT DEFAULT 'internal',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Campaign Contacts table (phone numbers to dial)
CREATE TABLE IF NOT EXISTS campaign_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES dialer_campaigns(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  name TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'dialing', 'answered', 'press1', 'connected', 'no_answer', 'busy', 'failed', 'dnc', 'answering_machine')),
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  answered_at TIMESTAMP WITH TIME ZONE,
  call_log_id UUID REFERENCES call_logs(id) ON DELETE SET NULL,
  notes TEXT,
  amd_detected BOOLEAN DEFAULT false,
  amd_status TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Outbound routing rules table
CREATE TABLE IF NOT EXISTS outbound_routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  pattern TEXT NOT NULL,
  trunk_id UUID NOT NULL REFERENCES sip_trunks(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 0,
  prefix_to_add TEXT,
  prefix_to_strip INTEGER DEFAULT 0,
  caller_id TEXT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================================
-- RING GROUPS & QUEUES
-- ===============================================

-- Ring Groups table
CREATE TABLE IF NOT EXISTS ring_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  strategy TEXT DEFAULT 'ringall' CHECK(strategy IN ('ringall', 'hunt', 'random', 'roundrobin')),
  ring_time INTEGER DEFAULT 20,
  failover_destination TEXT,
  failover_type TEXT DEFAULT 'voicemail' CHECK(failover_type IN ('voicemail', 'extension', 'ivr', 'hangup')),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ring Group Members table
CREATE TABLE IF NOT EXISTS ring_group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ring_group_id UUID NOT NULL REFERENCES ring_groups(id) ON DELETE CASCADE,
  extension_number TEXT NOT NULL REFERENCES extensions(number) ON DELETE CASCADE,
  priority INTEGER DEFAULT 1,
  UNIQUE(ring_group_id, extension_number)
);

-- Call Queues table
CREATE TABLE IF NOT EXISTS queues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  strategy TEXT DEFAULT 'ringall' CHECK(strategy IN ('ringall', 'hunt', 'random', 'roundrobin', 'leastrecent')),
  timeout_seconds INTEGER DEFAULT 30,
  retry_seconds INTEGER DEFAULT 5,
  max_wait_time INTEGER DEFAULT 300,
  hold_music_prompt_id UUID REFERENCES prompts(id) ON DELETE SET NULL,
  join_announcement_id UUID REFERENCES prompts(id) ON DELETE SET NULL,
  announce_frequency INTEGER DEFAULT 0,
  announce_position INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Queue Members table
CREATE TABLE IF NOT EXISTS queue_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
  extension_number TEXT NOT NULL,
  penalty INTEGER DEFAULT 0,
  paused BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(queue_id, extension_number)
);

-- ===============================================
-- CONTACTS
-- ===============================================

-- General Contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number TEXT NOT NULL,
  name TEXT,
  email TEXT,
  company TEXT,
  notes TEXT,
  tags TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'dnc', 'invalid', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contact custom fields table
CREATE TABLE IF NOT EXISTS contact_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_value TEXT,
  UNIQUE(contact_id, field_name)
);

-- ===============================================
-- WEB ADMIN SYSTEM
-- ===============================================

-- Web users (separate from Telegram admins)
CREATE TABLE IF NOT EXISTS web_users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'viewer' CHECK(role IN ('admin', 'supervisor', 'viewer')),
  display_name TEXT,
  enabled BOOLEAN DEFAULT true,
  must_change_password BOOLEAN DEFAULT false,
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add column if it doesn't exist (for migrations)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'web_users' AND column_name = 'must_change_password') THEN
    ALTER TABLE web_users ADD COLUMN must_change_password BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Sessions for refresh tokens
CREATE TABLE IF NOT EXISTS web_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User permissions table for granular access control
CREATE TABLE IF NOT EXISTS user_permissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  granted BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, permission)
);

-- Call recordings
CREATE TABLE IF NOT EXISTS call_recordings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_log_id UUID REFERENCES call_logs(id) ON DELETE SET NULL,
  unique_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  duration_seconds INTEGER,
  status TEXT DEFAULT 'recording' CHECK(status IN ('recording', 'completed', 'failed')),
  transcription_id UUID REFERENCES transcriptions(id) ON DELETE SET NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Add transcription_id column if it doesn't exist (for migrations)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'call_recordings' AND column_name = 'transcription_id') THEN
    ALTER TABLE call_recordings ADD COLUMN transcription_id UUID REFERENCES transcriptions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Audit log for web admin actions
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES web_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================================
-- AI CALLING SYSTEM
-- ===============================================

-- AI Agents (conversation personalities/bots)
CREATE TABLE IF NOT EXISTS ai_agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  greeting_text TEXT NOT NULL,

  -- Voice Configuration
  voice_provider TEXT DEFAULT 'piper' CHECK(voice_provider IN ('piper', 'elevenlabs')),
  voice_id TEXT NOT NULL,
  language TEXT DEFAULT 'en-US',

  -- LLM Configuration
  llm_provider TEXT DEFAULT 'openai' CHECK(llm_provider IN ('openai', 'anthropic', 'groq')),
  llm_model TEXT DEFAULT 'gpt-4o',
  llm_temperature REAL DEFAULT 0.7,
  llm_max_tokens INTEGER DEFAULT 150,

  -- STT Configuration
  stt_provider TEXT DEFAULT 'deepgram' CHECK(stt_provider IN ('deepgram', 'whisper', 'assemblyai', 'local_whisper')),
  stt_language TEXT DEFAULT 'en-US',

  -- Behavior Settings
  max_turn_duration_seconds INTEGER DEFAULT 30,
  silence_timeout_ms INTEGER DEFAULT 3000,
  interrupt_threshold REAL DEFAULT 0.5,

  -- Function calling
  enabled_functions TEXT,

  -- Realtime mode
  use_realtime BOOLEAN DEFAULT false,

  -- Metadata
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Conversations (each call session with AI)
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_log_id UUID REFERENCES call_logs(id) ON DELETE SET NULL,
  ai_agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),

  -- Call metadata
  caller_id TEXT,
  called_number TEXT,
  channel_id TEXT,

  -- State tracking
  state TEXT DEFAULT 'init' CHECK(state IN ('init', 'greeting', 'listening', 'thinking', 'speaking', 'function_calling', 'transfer', 'ended')),

  -- Performance metrics
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  total_duration_seconds INTEGER,
  ai_speaking_time_ms INTEGER DEFAULT 0,
  user_speaking_time_ms INTEGER DEFAULT 0,
  silence_time_ms INTEGER DEFAULT 0,

  -- LLM metrics
  total_llm_tokens INTEGER DEFAULT 0,
  total_llm_latency_ms INTEGER DEFAULT 0,

  -- STT metrics
  total_stt_latency_ms INTEGER DEFAULT 0,

  -- TTS metrics
  total_tts_latency_ms INTEGER DEFAULT 0,

  -- Outcome
  outcome TEXT CHECK(outcome IN ('completed', 'transferred', 'voicemail', 'abandoned', 'error')),
  outcome_details TEXT,
  sentiment_score REAL,

  -- Context snapshot for recovery
  context_snapshot TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversation Turns (each exchange in conversation)
CREATE TABLE IF NOT EXISTS ai_conversation_turns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,

  -- Speaker
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'function')),

  -- Content
  content TEXT NOT NULL,
  audio_duration_ms INTEGER,

  -- For function calls
  function_name TEXT,
  function_args TEXT,
  function_result TEXT,

  -- Timing
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE,
  latency_ms INTEGER,

  -- Metadata
  stt_confidence REAL,
  was_interrupted BOOLEAN DEFAULT false,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transcriptions (for recordings and voicemails)
CREATE TABLE IF NOT EXISTS transcriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type TEXT NOT NULL CHECK(source_type IN ('recording', 'voicemail', 'conversation')),
  source_id TEXT NOT NULL,

  -- Transcription data
  full_text TEXT NOT NULL,
  segments TEXT,
  language_detected TEXT,
  confidence REAL,

  -- Processing info
  provider TEXT NOT NULL,
  processing_time_ms INTEGER,
  word_count INTEGER,
  duration_seconds REAL,

  -- Analysis
  summary TEXT,
  keywords TEXT,
  sentiment TEXT CHECK(sentiment IN ('positive', 'neutral', 'negative')),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transcription Jobs Queue
CREATE TABLE IF NOT EXISTS transcription_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type TEXT NOT NULL CHECK(source_type IN ('recording', 'voicemail', 'conversation')),
  source_id UUID NOT NULL,
  audio_path TEXT NOT NULL,

  -- Processing settings
  provider TEXT,
  language TEXT DEFAULT 'en-US',
  priority INTEGER DEFAULT 0,

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,

  -- Results
  transcription_id UUID REFERENCES transcriptions(id) ON DELETE SET NULL,
  error_message TEXT,

  -- Timing
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Voicemails
CREATE TABLE IF NOT EXISTS voicemails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mailbox TEXT NOT NULL,
  caller_id TEXT,
  caller_name TEXT,
  duration_seconds INTEGER,
  file_path TEXT NOT NULL,

  -- Transcription
  transcription_id UUID REFERENCES transcriptions(id) ON DELETE SET NULL,

  -- Status
  read BOOLEAN DEFAULT false,
  notified BOOLEAN DEFAULT false,
  urgent BOOLEAN DEFAULT false,

  -- Metadata from Asterisk
  msg_id TEXT,
  origdate TEXT,
  origtime TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Call Summaries (AI-generated summaries of conversations)
CREATE TABLE IF NOT EXISTS call_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES ai_conversations(id) ON DELETE CASCADE,

  -- Summary content
  summary_text TEXT NOT NULL,
  key_points JSONB,
  action_items JSONB,

  -- Analysis
  sentiment TEXT CHECK(sentiment IN ('positive', 'neutral', 'negative', 'mixed')),
  caller_intent TEXT,
  follow_up_needed BOOLEAN DEFAULT false,
  follow_up_notes TEXT,

  -- Generation metadata
  generated_by TEXT NOT NULL,
  model_used TEXT,
  tokens_used INTEGER,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Insights (aggregated analytics and patterns)
CREATE TABLE IF NOT EXISTS ai_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  insight_type TEXT NOT NULL CHECK(insight_type IN ('intent', 'faq', 'agent_score', 'topic', 'trend')),
  entity_type TEXT,
  entity_id TEXT,

  -- Insight data
  data JSONB NOT NULL,
  confidence REAL,

  -- Time period this insight covers
  period_start TIMESTAMP WITH TIME ZONE,
  period_end TIMESTAMP WITH TIME ZONE,

  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API Keys for external access
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,

  -- Ownership
  user_id INTEGER REFERENCES web_users(id) ON DELETE CASCADE,

  -- Permissions
  scopes TEXT NOT NULL DEFAULT '["calls:read"]',

  -- Rate limiting
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_day INTEGER DEFAULT 10000,

  -- Cost controls
  monthly_budget_cents INTEGER,
  current_month_usage_cents INTEGER DEFAULT 0,

  -- Status
  enabled BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API Usage Tracking
CREATE TABLE IF NOT EXISTS api_usage (
  id SERIAL PRIMARY KEY,
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,

  -- Request details
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,

  -- Timing
  request_time TIMESTAMP WITH TIME ZONE NOT NULL,
  response_time_ms INTEGER,

  -- Cost tracking
  cost_cents INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  audio_seconds REAL DEFAULT 0,

  ip_address TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Function Definitions
CREATE TABLE IF NOT EXISTS ai_functions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,

  -- Function schema (OpenAI format)
  parameters TEXT NOT NULL,

  -- Implementation
  handler_type TEXT NOT NULL CHECK(handler_type IN ('builtin', 'webhook', 'script')),
  handler_config TEXT NOT NULL,

  -- Permissions
  requires_confirmation BOOLEAN DEFAULT false,

  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Provider Configurations
CREATE TABLE IF NOT EXISTS provider_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_type TEXT NOT NULL CHECK(provider_type IN ('llm', 'stt', 'tts')),
  provider_name TEXT NOT NULL,

  -- API Configuration
  api_key_encrypted TEXT,
  api_endpoint TEXT,

  -- Settings
  config TEXT,

  -- Health
  last_health_check TIMESTAMP WITH TIME ZONE,
  is_healthy BOOLEAN DEFAULT true,

  -- Priority for failover
  priority INTEGER DEFAULT 0,

  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(provider_type, provider_name)
);

-- Active AI Calls (for real-time state)
CREATE TABLE IF NOT EXISTS active_ai_calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES ai_conversations(id) ON DELETE CASCADE,
  ai_agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,

  -- Current state
  state TEXT NOT NULL,
  current_turn INTEGER DEFAULT 0,

  -- Connection info
  audio_socket_port INTEGER,
  websocket_session_id TEXT,

  -- Real-time context
  conversation_context TEXT,
  pending_function_call TEXT,

  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- ===============================================
-- SCHEMA VERSION TRACKING
-- ===============================================

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================================
-- INDEXES
-- ===============================================

-- Call logs indexes
CREATE INDEX IF NOT EXISTS idx_call_logs_timestamp ON call_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_call_logs_did ON call_logs(did);
CREATE INDEX IF NOT EXISTS idx_call_logs_ivr_menu ON call_logs(ivr_menu_id);

-- Routing indexes
CREATE INDEX IF NOT EXISTS idx_routing_rules_did ON routing_rules(did);
CREATE INDEX IF NOT EXISTS idx_ivr_options_menu ON ivr_options(menu_id);

-- Dialer indexes
CREATE INDEX IF NOT EXISTS idx_dialer_campaigns_status ON dialer_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign ON campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_status ON campaign_contacts(status);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign_status ON campaign_contacts(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_outbound_routes_priority ON outbound_routes(priority);
CREATE INDEX IF NOT EXISTS idx_outbound_routes_enabled ON outbound_routes(enabled);

-- Ring groups and queues indexes
CREATE INDEX IF NOT EXISTS idx_ring_group_members_group ON ring_group_members(ring_group_id);
CREATE INDEX IF NOT EXISTS idx_ring_group_members_extension ON ring_group_members(extension_number);
CREATE INDEX IF NOT EXISTS idx_queue_members_queue ON queue_members(queue_id);
CREATE INDEX IF NOT EXISTS idx_queue_members_extension ON queue_members(extension_number);
CREATE INDEX IF NOT EXISTS idx_queues_enabled ON queues(enabled);

-- Contacts indexes
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts(tags);
CREATE INDEX IF NOT EXISTS idx_contact_fields_contact ON contact_fields(contact_id);

-- Web admin indexes
CREATE INDEX IF NOT EXISTS idx_web_sessions_user ON web_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_web_sessions_expires ON web_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_permission ON user_permissions(permission);
CREATE INDEX IF NOT EXISTS idx_call_recordings_call_log ON call_recordings(call_log_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_unique_id ON call_recordings(unique_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_status ON call_recordings(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- AI system indexes
CREATE INDEX IF NOT EXISTS idx_ai_agents_enabled ON ai_agents(enabled);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_agent ON ai_conversations(ai_agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_state ON ai_conversations(state);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_time ON ai_conversations(start_time);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_direction ON ai_conversations(direction);
CREATE INDEX IF NOT EXISTS idx_ai_conversation_turns_conv ON ai_conversation_turns(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversation_turns_role ON ai_conversation_turns(role);
CREATE INDEX IF NOT EXISTS idx_transcriptions_source ON transcriptions(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_status ON transcription_jobs(status);
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_priority ON transcription_jobs(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_voicemails_mailbox ON voicemails(mailbox);
CREATE INDEX IF NOT EXISTS idx_voicemails_read ON voicemails(read);
CREATE INDEX IF NOT EXISTS idx_voicemails_created ON voicemails(created_at);
CREATE INDEX IF NOT EXISTS idx_call_summaries_conversation ON call_summaries(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON ai_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_ai_insights_entity ON ai_insights(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_key ON api_usage(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_time ON api_usage(request_time);
CREATE INDEX IF NOT EXISTS idx_active_ai_calls_agent ON active_ai_calls(ai_agent_id);
CREATE INDEX IF NOT EXISTS idx_provider_configs_type ON provider_configs(provider_type);

-- ===============================================
-- DEFAULT SETTINGS
-- ===============================================

INSERT INTO settings (key, value) VALUES
  ('campaign_active', 'false'),
  ('elevenlabs_default_voice', '21m00Tcm4TlvDq8ikWAM'),
  ('web_admin_initialized', 'false'),
  ('default_moh_prompt_id', ''),
  ('ai_default_llm_provider', 'openai'),
  ('ai_default_stt_provider', 'deepgram'),
  ('ai_audio_socket_port', '9092')
ON CONFLICT (key) DO NOTHING;

-- Set schema version
INSERT INTO schema_version (version) VALUES (15)
ON CONFLICT (version) DO NOTHING;
