import { DatabaseManager } from './database';
import { dbLogger } from '../utils/logger';

interface Migration {
  version: number;
  name: string;
  up: string;
}

// All database migrations (PostgreSQL syntax)
const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
      -- Settings table (key-value store for configuration)
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Admin users table (Telegram admins)
      CREATE TABLE IF NOT EXISTS admin_users (
        telegram_id BIGINT PRIMARY KEY,
        username TEXT,
        role TEXT DEFAULT 'admin' CHECK(role IN ('admin', 'viewer')),
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Prompts table (TTS and uploaded audio files)
      CREATE TABLE IF NOT EXISTS prompts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('tts', 'uploaded')),
        file_path TEXT,
        text TEXT,
        voice TEXT,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- IVR Menus table
      CREATE TABLE IF NOT EXISTS ivr_menus (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        welcome_prompt_id TEXT REFERENCES prompts(id) ON DELETE SET NULL,
        invalid_prompt_id TEXT REFERENCES prompts(id) ON DELETE SET NULL,
        timeout_prompt_id TEXT REFERENCES prompts(id) ON DELETE SET NULL,
        timeout_seconds INTEGER DEFAULT 5,
        max_retries INTEGER DEFAULT 3,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- IVR Options table (DTMF key mappings)
      CREATE TABLE IF NOT EXISTS ivr_options (
        id TEXT PRIMARY KEY,
        menu_id TEXT NOT NULL REFERENCES ivr_menus(id) ON DELETE CASCADE,
        key_press TEXT NOT NULL,
        action_type TEXT NOT NULL CHECK(action_type IN ('transfer', 'submenu', 'hangup', 'voicemail', 'queue', 'external')),
        destination TEXT,
        pre_connect_prompt_id TEXT REFERENCES prompts(id) ON DELETE SET NULL,
        post_call_prompt_id TEXT REFERENCES prompts(id) ON DELETE SET NULL,
        UNIQUE(menu_id, key_press)
      );

      -- Extensions table (PJSIP endpoints)
      CREATE TABLE IF NOT EXISTS extensions (
        number TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        password TEXT NOT NULL,
        enabled BOOLEAN DEFAULT true,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Routing rules table (DID to IVR/extension mapping)
      CREATE TABLE IF NOT EXISTS routing_rules (
        id TEXT PRIMARY KEY,
        did TEXT NOT NULL UNIQUE,
        target_type TEXT NOT NULL CHECK(target_type IN ('ivr_menu', 'extension', 'queue')),
        target_id TEXT NOT NULL,
        enabled BOOLEAN DEFAULT true,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Call logs table
      CREATE TABLE IF NOT EXISTS call_logs (
        id TEXT PRIMARY KEY,
        caller_id TEXT,
        did TEXT,
        timestamp INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
        ivr_menu_id TEXT,
        options_pressed TEXT,
        final_destination TEXT,
        duration_seconds INTEGER,
        disposition TEXT,
        unique_id TEXT
      );

      -- Create indexes for better query performance
      CREATE INDEX IF NOT EXISTS idx_call_logs_timestamp ON call_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_call_logs_did ON call_logs(did);
      CREATE INDEX IF NOT EXISTS idx_call_logs_ivr_menu ON call_logs(ivr_menu_id);
      CREATE INDEX IF NOT EXISTS idx_routing_rules_did ON routing_rules(did);
      CREATE INDEX IF NOT EXISTS idx_ivr_options_menu ON ivr_options(menu_id);

      -- Insert default settings
      INSERT INTO settings (key, value) VALUES ('campaign_active', 'false') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('elevenlabs_default_voice', '21m00Tcm4TlvDq8ikWAM') ON CONFLICT (key) DO NOTHING;
    `,
  },
  {
    version: 2,
    name: 'add_dialer_campaigns',
    up: `
      -- Dialer Campaigns table
      CREATE TABLE IF NOT EXISTS dialer_campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'paused' CHECK(status IN ('paused', 'running', 'completed')),
        ivr_menu_id TEXT REFERENCES ivr_menus(id) ON DELETE SET NULL,
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
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
        started_at INTEGER,
        completed_at INTEGER
      );

      -- Campaign Contacts table (phone numbers to dial)
      CREATE TABLE IF NOT EXISTS campaign_contacts (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES dialer_campaigns(id) ON DELETE CASCADE,
        phone_number TEXT NOT NULL,
        name TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'dialing', 'answered', 'press1', 'connected', 'no_answer', 'busy', 'failed', 'dnc')),
        attempts INTEGER DEFAULT 0,
        last_attempt_at INTEGER,
        answered_at INTEGER,
        call_log_id TEXT,
        notes TEXT,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Indexes for dialer tables
      CREATE INDEX IF NOT EXISTS idx_dialer_campaigns_status ON dialer_campaigns(status);
      CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign ON campaign_contacts(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_campaign_contacts_status ON campaign_contacts(status);
      CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign_status ON campaign_contacts(campaign_id, status);
    `,
  },
  {
    version: 3,
    name: 'add_hold_music',
    up: `
      -- Add hold music prompt ID to campaigns
      ALTER TABLE dialer_campaigns ADD COLUMN IF NOT EXISTS hold_music_prompt_id TEXT REFERENCES prompts(id) ON DELETE SET NULL;
    `,
  },
  {
    version: 4,
    name: 'add_3cx_transfer_config',
    up: `
      -- Add 3CX/trunk transfer configuration to campaigns
      ALTER TABLE dialer_campaigns ADD COLUMN IF NOT EXISTS transfer_trunk_id TEXT;
      ALTER TABLE dialer_campaigns ADD COLUMN IF NOT EXISTS transfer_destination TEXT;
      ALTER TABLE dialer_campaigns ADD COLUMN IF NOT EXISTS transfer_mode TEXT DEFAULT 'internal';
    `,
  },
  {
    version: 5,
    name: 'add_ivr_trunk_transfer',
    up: `
      -- Add trunk transfer configuration to IVR options
      ALTER TABLE ivr_options ADD COLUMN IF NOT EXISTS transfer_trunk_id TEXT;
      ALTER TABLE ivr_options ADD COLUMN IF NOT EXISTS transfer_destination TEXT;
      ALTER TABLE ivr_options ADD COLUMN IF NOT EXISTS transfer_mode TEXT DEFAULT 'internal';
    `,
  },
  {
    version: 6,
    name: 'add_web_admin_tables',
    up: `
      -- Web users (separate from Telegram admins)
      CREATE TABLE IF NOT EXISTS web_users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'viewer' CHECK(role IN ('admin', 'supervisor', 'viewer')),
        display_name TEXT,
        enabled BOOLEAN DEFAULT true,
        last_login_at INTEGER,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Sessions for refresh tokens
      CREATE TABLE IF NOT EXISTS web_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
        refresh_token_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Call recordings
      CREATE TABLE IF NOT EXISTS call_recordings (
        id TEXT PRIMARY KEY,
        call_log_id TEXT REFERENCES call_logs(id),
        unique_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        duration_seconds INTEGER,
        status TEXT DEFAULT 'recording' CHECK(status IN ('recording', 'completed', 'failed')),
        started_at INTEGER NOT NULL,
        completed_at INTEGER
      );

      -- Audit log for web admin actions
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES web_users(id),
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        details TEXT,
        ip_address TEXT,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Indexes for web admin tables
      CREATE INDEX IF NOT EXISTS idx_web_sessions_user ON web_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_web_sessions_expires ON web_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_call_recordings_call_log ON call_recordings(call_log_id);
      CREATE INDEX IF NOT EXISTS idx_call_recordings_unique_id ON call_recordings(unique_id);
      CREATE INDEX IF NOT EXISTS idx_call_recordings_status ON call_recordings(status);
      CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
      CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

      -- Add default web admin user initialization setting
      INSERT INTO settings (key, value) VALUES ('web_admin_initialized', 'false') ON CONFLICT (key) DO NOTHING;
    `,
  },
  {
    version: 7,
    name: 'add_ring_groups_and_contacts',
    up: `
      -- Ring Groups table (group of extensions that ring together)
      CREATE TABLE IF NOT EXISTS ring_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        strategy TEXT DEFAULT 'ringall' CHECK(strategy IN ('ringall', 'hunt', 'random', 'roundrobin')),
        ring_time INTEGER DEFAULT 20,
        failover_destination TEXT,
        failover_type TEXT DEFAULT 'voicemail' CHECK(failover_type IN ('voicemail', 'extension', 'ivr', 'hangup')),
        enabled BOOLEAN DEFAULT true,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Ring Group Members table
      CREATE TABLE IF NOT EXISTS ring_group_members (
        id TEXT PRIMARY KEY,
        ring_group_id TEXT NOT NULL REFERENCES ring_groups(id) ON DELETE CASCADE,
        extension_number TEXT NOT NULL REFERENCES extensions(number) ON DELETE CASCADE,
        priority INTEGER DEFAULT 1,
        UNIQUE(ring_group_id, extension_number)
      );

      -- General Contacts table (for campaigns and general use)
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        phone_number TEXT NOT NULL,
        name TEXT,
        email TEXT,
        company TEXT,
        notes TEXT,
        tags TEXT,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'dnc', 'invalid', 'archived')),
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
        updated_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Contact custom fields table
      CREATE TABLE IF NOT EXISTS contact_fields (
        id TEXT PRIMARY KEY,
        contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        field_name TEXT NOT NULL,
        field_value TEXT,
        UNIQUE(contact_id, field_name)
      );

      -- Indexes for ring groups and contacts
      CREATE INDEX IF NOT EXISTS idx_ring_group_members_group ON ring_group_members(ring_group_id);
      CREATE INDEX IF NOT EXISTS idx_ring_group_members_extension ON ring_group_members(extension_number);
      CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);
      CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
      CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts(tags);
      CREATE INDEX IF NOT EXISTS idx_contact_fields_contact ON contact_fields(contact_id);
    `,
  },
  {
    version: 8,
    name: 'fix_routing_constraint_for_ring_groups',
    up: `
      -- PostgreSQL: Drop and recreate constraint for ring_group support
      ALTER TABLE routing_rules DROP CONSTRAINT IF EXISTS routing_rules_target_type_check;
      ALTER TABLE routing_rules ADD CONSTRAINT routing_rules_target_type_check
        CHECK(target_type IN ('ivr_menu', 'extension', 'queue', 'ring_group'));
    `,
  },
  {
    version: 9,
    name: 'add_user_permissions',
    up: `
      -- User permissions table for granular access control
      CREATE TABLE IF NOT EXISTS user_permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
        permission TEXT NOT NULL,
        granted BOOLEAN DEFAULT true,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
        UNIQUE(user_id, permission)
      );

      -- Index for faster permission lookups
      CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_permissions_permission ON user_permissions(permission);
    `,
  },
  {
    version: 10,
    name: 'add_queues',
    up: `
      -- Call Queues table
      CREATE TABLE IF NOT EXISTS queues (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        strategy TEXT DEFAULT 'ringall' CHECK(strategy IN ('ringall', 'hunt', 'random', 'roundrobin', 'leastrecent')),
        timeout_seconds INTEGER DEFAULT 30,
        retry_seconds INTEGER DEFAULT 5,
        max_wait_time INTEGER DEFAULT 300,
        hold_music_prompt_id TEXT REFERENCES prompts(id) ON DELETE SET NULL,
        join_announcement_id TEXT REFERENCES prompts(id) ON DELETE SET NULL,
        announce_frequency INTEGER DEFAULT 0,
        announce_position INTEGER DEFAULT 0,
        enabled BOOLEAN DEFAULT true,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Queue Members table
      CREATE TABLE IF NOT EXISTS queue_members (
        id TEXT PRIMARY KEY,
        queue_id TEXT NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
        extension_number TEXT NOT NULL,
        penalty INTEGER DEFAULT 0,
        paused BOOLEAN DEFAULT false,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
        UNIQUE(queue_id, extension_number)
      );

      -- Indexes for queues
      CREATE INDEX IF NOT EXISTS idx_queue_members_queue ON queue_members(queue_id);
      CREATE INDEX IF NOT EXISTS idx_queue_members_extension ON queue_members(extension_number);
      CREATE INDEX IF NOT EXISTS idx_queues_enabled ON queues(enabled);
    `,
  },
  {
    version: 11,
    name: 'add_sip_trunks',
    up: `
      -- SIP Trunks table
      CREATE TABLE IF NOT EXISTS sip_trunks (
        id TEXT PRIMARY KEY,
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
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Add global MOH setting
      INSERT INTO settings (key, value) VALUES ('default_moh_prompt_id', '') ON CONFLICT (key) DO NOTHING;
    `,
  },
  {
    version: 12,
    name: 'add_outbound_routes',
    up: `
      -- Outbound routing rules table
      CREATE TABLE IF NOT EXISTS outbound_routes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        pattern TEXT NOT NULL,
        trunk_id TEXT NOT NULL REFERENCES sip_trunks(id) ON DELETE CASCADE,
        priority INTEGER DEFAULT 0,
        prefix_to_add TEXT,
        prefix_to_strip INTEGER DEFAULT 0,
        caller_id TEXT,
        enabled BOOLEAN DEFAULT true,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_outbound_routes_priority ON outbound_routes(priority);
      CREATE INDEX IF NOT EXISTS idx_outbound_routes_enabled ON outbound_routes(enabled);
    `,
  },
  {
    version: 13,
    name: 'add_ai_calling_system',
    up: `
      -- AI Agents (conversation personalities/bots)
      CREATE TABLE IF NOT EXISTS ai_agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        system_prompt TEXT NOT NULL,
        greeting_text TEXT NOT NULL,
        voice_provider TEXT DEFAULT 'piper' CHECK(voice_provider IN ('piper', 'elevenlabs')),
        voice_id TEXT NOT NULL,
        language TEXT DEFAULT 'en-US',
        llm_provider TEXT DEFAULT 'openai' CHECK(llm_provider IN ('openai', 'anthropic', 'groq')),
        llm_model TEXT DEFAULT 'gpt-4o',
        llm_temperature REAL DEFAULT 0.7,
        llm_max_tokens INTEGER DEFAULT 150,
        stt_provider TEXT DEFAULT 'deepgram' CHECK(stt_provider IN ('deepgram', 'whisper', 'assemblyai', 'local_whisper')),
        stt_language TEXT DEFAULT 'en-US',
        max_turn_duration_seconds INTEGER DEFAULT 30,
        silence_timeout_ms INTEGER DEFAULT 3000,
        interrupt_threshold REAL DEFAULT 0.5,
        enabled_functions TEXT,
        enabled BOOLEAN DEFAULT true,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
        updated_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- AI Conversations (each call session with AI)
      CREATE TABLE IF NOT EXISTS ai_conversations (
        id TEXT PRIMARY KEY,
        call_log_id TEXT REFERENCES call_logs(id),
        ai_agent_id TEXT REFERENCES ai_agents(id),
        direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
        caller_id TEXT,
        called_number TEXT,
        channel_id TEXT,
        state TEXT DEFAULT 'init' CHECK(state IN ('init', 'greeting', 'listening', 'thinking', 'speaking', 'function_calling', 'transfer', 'ended')),
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        total_duration_seconds INTEGER,
        ai_speaking_time_ms INTEGER DEFAULT 0,
        user_speaking_time_ms INTEGER DEFAULT 0,
        silence_time_ms INTEGER DEFAULT 0,
        total_llm_tokens INTEGER DEFAULT 0,
        total_llm_latency_ms INTEGER DEFAULT 0,
        total_stt_latency_ms INTEGER DEFAULT 0,
        total_tts_latency_ms INTEGER DEFAULT 0,
        outcome TEXT CHECK(outcome IN ('completed', 'transferred', 'voicemail', 'abandoned', 'error')),
        outcome_details TEXT,
        sentiment_score REAL,
        context_snapshot TEXT,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Conversation Turns
      CREATE TABLE IF NOT EXISTS ai_conversation_turns (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
        turn_number INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'function')),
        content TEXT NOT NULL,
        audio_duration_ms INTEGER,
        function_name TEXT,
        function_args TEXT,
        function_result TEXT,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        latency_ms INTEGER,
        stt_confidence REAL,
        was_interrupted BOOLEAN DEFAULT false,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Transcriptions
      CREATE TABLE IF NOT EXISTS transcriptions (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL CHECK(source_type IN ('recording', 'voicemail', 'conversation')),
        source_id TEXT NOT NULL,
        full_text TEXT NOT NULL,
        segments TEXT,
        language_detected TEXT,
        confidence REAL,
        provider TEXT NOT NULL,
        processing_time_ms INTEGER,
        word_count INTEGER,
        duration_seconds REAL,
        summary TEXT,
        keywords TEXT,
        sentiment TEXT CHECK(sentiment IN ('positive', 'neutral', 'negative')),
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- API Keys
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL,
        user_id INTEGER REFERENCES web_users(id) ON DELETE CASCADE,
        scopes TEXT NOT NULL DEFAULT '["calls:read"]',
        rate_limit_per_minute INTEGER DEFAULT 60,
        rate_limit_per_day INTEGER DEFAULT 10000,
        monthly_budget_cents INTEGER,
        current_month_usage_cents INTEGER DEFAULT 0,
        enabled BOOLEAN DEFAULT true,
        last_used_at INTEGER,
        expires_at INTEGER,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- API Usage
      CREATE TABLE IF NOT EXISTS api_usage (
        id SERIAL PRIMARY KEY,
        api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        request_time INTEGER NOT NULL,
        response_time_ms INTEGER,
        cost_cents INTEGER DEFAULT 0,
        tokens_used INTEGER DEFAULT 0,
        audio_seconds REAL DEFAULT 0,
        ip_address TEXT,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- AI Functions
      CREATE TABLE IF NOT EXISTS ai_functions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL,
        parameters TEXT NOT NULL,
        handler_type TEXT NOT NULL CHECK(handler_type IN ('builtin', 'webhook', 'script')),
        handler_config TEXT NOT NULL,
        requires_confirmation BOOLEAN DEFAULT false,
        enabled BOOLEAN DEFAULT true,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Provider Configurations
      CREATE TABLE IF NOT EXISTS provider_configs (
        id TEXT PRIMARY KEY,
        provider_type TEXT NOT NULL CHECK(provider_type IN ('llm', 'stt', 'tts')),
        provider_name TEXT NOT NULL,
        api_key_encrypted TEXT,
        api_endpoint TEXT,
        config TEXT,
        last_health_check INTEGER,
        is_healthy BOOLEAN DEFAULT true,
        priority INTEGER DEFAULT 0,
        enabled BOOLEAN DEFAULT true,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
        UNIQUE(provider_type, provider_name)
      );

      -- Active AI Calls
      CREATE TABLE IF NOT EXISTS active_ai_calls (
        id TEXT PRIMARY KEY,
        conversation_id TEXT REFERENCES ai_conversations(id),
        ai_agent_id TEXT REFERENCES ai_agents(id),
        state TEXT NOT NULL,
        current_turn INTEGER DEFAULT 0,
        audio_socket_port INTEGER,
        websocket_session_id TEXT,
        conversation_context TEXT,
        pending_function_call TEXT,
        started_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_ai_agents_enabled ON ai_agents(enabled);
      CREATE INDEX IF NOT EXISTS idx_ai_conversations_agent ON ai_conversations(ai_agent_id);
      CREATE INDEX IF NOT EXISTS idx_ai_conversations_state ON ai_conversations(state);
      CREATE INDEX IF NOT EXISTS idx_ai_conversations_time ON ai_conversations(start_time);
      CREATE INDEX IF NOT EXISTS idx_ai_conversations_direction ON ai_conversations(direction);
      CREATE INDEX IF NOT EXISTS idx_ai_conversation_turns_conv ON ai_conversation_turns(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_ai_conversation_turns_role ON ai_conversation_turns(role);
      CREATE INDEX IF NOT EXISTS idx_transcriptions_source ON transcriptions(source_type, source_id);
      CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
      CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
      CREATE INDEX IF NOT EXISTS idx_api_usage_key ON api_usage(api_key_id);
      CREATE INDEX IF NOT EXISTS idx_api_usage_time ON api_usage(request_time);
      CREATE INDEX IF NOT EXISTS idx_active_ai_calls_agent ON active_ai_calls(ai_agent_id);
      CREATE INDEX IF NOT EXISTS idx_provider_configs_type ON provider_configs(provider_type);

      -- Default settings
      INSERT INTO settings (key, value) VALUES ('ai_default_llm_provider', 'openai') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('ai_default_stt_provider', 'deepgram') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('ai_audio_socket_port', '9092') ON CONFLICT (key) DO NOTHING;
    `,
  },
  {
    version: 14,
    name: 'add_ai_realtime_mode',
    up: `
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS use_realtime BOOLEAN DEFAULT false;
    `,
  },
  {
    version: 15,
    name: 'add_must_change_password',
    up: `
      ALTER TABLE web_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
    `,
  },
  {
    version: 16,
    name: 'add_missing_ai_tables',
    up: `
      -- Transcription Jobs Queue
      CREATE TABLE IF NOT EXISTS transcription_jobs (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL CHECK(source_type IN ('recording', 'voicemail', 'conversation')),
        source_id TEXT NOT NULL,
        audio_path TEXT NOT NULL,
        provider TEXT,
        language TEXT DEFAULT 'en-US',
        priority INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        transcription_id TEXT REFERENCES transcriptions(id) ON DELETE SET NULL,
        error_message TEXT,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
        started_at INTEGER,
        completed_at INTEGER
      );

      -- Voicemails
      CREATE TABLE IF NOT EXISTS voicemails (
        id TEXT PRIMARY KEY,
        mailbox TEXT NOT NULL,
        caller_id TEXT,
        caller_name TEXT,
        duration_seconds INTEGER,
        file_path TEXT NOT NULL,
        transcription_id TEXT REFERENCES transcriptions(id) ON DELETE SET NULL,
        read BOOLEAN DEFAULT false,
        notified BOOLEAN DEFAULT false,
        urgent BOOLEAN DEFAULT false,
        msg_id TEXT,
        origdate TEXT,
        origtime TEXT,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Call Summaries
      CREATE TABLE IF NOT EXISTS call_summaries (
        id TEXT PRIMARY KEY,
        conversation_id TEXT REFERENCES ai_conversations(id) ON DELETE CASCADE,
        summary_text TEXT NOT NULL,
        key_points TEXT,
        action_items TEXT,
        sentiment TEXT CHECK(sentiment IN ('positive', 'neutral', 'negative', 'mixed')),
        caller_intent TEXT,
        follow_up_needed BOOLEAN DEFAULT false,
        follow_up_notes TEXT,
        generated_by TEXT NOT NULL,
        model_used TEXT,
        tokens_used INTEGER,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- AI Insights
      CREATE TABLE IF NOT EXISTS ai_insights (
        id TEXT PRIMARY KEY,
        insight_type TEXT NOT NULL CHECK(insight_type IN ('intent', 'faq', 'agent_score', 'topic', 'trend')),
        entity_type TEXT,
        entity_id TEXT,
        data TEXT NOT NULL,
        confidence REAL,
        period_start INTEGER,
        period_end INTEGER,
        generated_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_transcription_jobs_status ON transcription_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_transcription_jobs_priority ON transcription_jobs(priority DESC, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_voicemails_mailbox ON voicemails(mailbox);
      CREATE INDEX IF NOT EXISTS idx_call_summaries_conversation ON call_summaries(conversation_id);
    `
  },
  {
    version: 17,
    name: 'add_user_avatar',
    up: `
      ALTER TABLE web_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    `
  },
  {
    version: 18,
    name: 'add_stir_shaken_to_trunks',
    up: `
      ALTER TABLE sip_trunks ADD COLUMN IF NOT EXISTS stir_shaken_enabled BOOLEAN DEFAULT false;
      ALTER TABLE sip_trunks ADD COLUMN IF NOT EXISTS stir_shaken_attest TEXT;
      ALTER TABLE sip_trunks ADD COLUMN IF NOT EXISTS stir_shaken_profile TEXT;
    `
  },
  {
    version: 19,
    name: 'fix_ai_agents_provider_constraints',
    up: `
      -- PostgreSQL: Update CHECK constraints for ai_agents
      ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agents_voice_provider_check;
      ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agents_llm_provider_check;
      ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agents_stt_provider_check;

      ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_voice_provider_check
        CHECK(voice_provider IN ('piper', 'elevenlabs', 'openai_realtime', 'cartesia', 'google', 'deepgram'));
      ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_llm_provider_check
        CHECK(llm_provider IN ('openai', 'anthropic', 'groq', 'openai_realtime'));
      ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_stt_provider_check
        CHECK(stt_provider IN ('deepgram', 'whisper', 'assemblyai', 'local_whisper', 'openai_realtime'));

      -- Update defaults (use PostgreSQL boolean syntax)
      ALTER TABLE ai_agents ALTER COLUMN voice_provider SET DEFAULT 'openai_realtime';
      ALTER TABLE ai_agents ALTER COLUMN stt_provider SET DEFAULT 'openai_realtime';
      ALTER TABLE ai_agents ALTER COLUMN use_realtime SET DEFAULT true;
    `
  },
  {
    version: 20,
    name: 'add_ai_agent_templates',
    up: `
      -- AI Agent Templates
      CREATE TABLE IF NOT EXISTS ai_agent_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('customer-support', 'sales', 'appointments', 'faq', 'after-hours', 'custom')),
        description TEXT,
        system_prompt TEXT NOT NULL,
        greeting_text TEXT NOT NULL,
        voice TEXT DEFAULT 'alloy',
        enabled_functions TEXT DEFAULT '[]',
        icon TEXT,
        is_default BOOLEAN DEFAULT false,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Seed default templates
      INSERT INTO ai_agent_templates (id, name, category, description, system_prompt, greeting_text, voice, enabled_functions, is_default) VALUES
      (
        'tpl-customer-support',
        'Customer Support',
        'customer-support',
        'Helpful agent for handling customer inquiries, troubleshooting, and support requests.',
        'You are a friendly and professional customer support agent. Your goal is to help callers resolve their issues efficiently while maintaining a positive experience. Be empathetic, patient, and solution-oriented. If you cannot resolve an issue, offer to transfer to a human agent or schedule a callback.',
        'Thank you for calling. My name is Nova, and I''m here to help you today. How can I assist you?',
        'sage',
        '["transfer_to_queue", "schedule_callback", "collect_information", "send_sms"]',
        true
      ),
      (
        'tpl-sales',
        'Sales Lead Generation',
        'sales',
        'Engaging agent for qualifying leads and capturing sales opportunities.',
        'You are an enthusiastic sales representative. Your goal is to understand the caller''s needs, qualify them as a potential customer, and either collect their information for follow-up or transfer them to a sales specialist. Be professional but personable, ask open-ended questions, and highlight the value we provide.',
        'Hi there! Thanks for your interest in our services. I''d love to learn more about what you''re looking for. What brings you to us today?',
        'shimmer',
        '["collect_information", "transfer_to_extension", "send_sms", "schedule_callback"]',
        true
      ),
      (
        'tpl-appointments',
        'Appointment Booking',
        'appointments',
        'Efficient agent for scheduling and managing appointments.',
        'You are an appointment scheduling assistant. Help callers book, reschedule, or cancel appointments. Be efficient and clear about available times. Confirm all details before finalizing. If the caller needs to speak with someone, offer to transfer them.',
        'Hello! I can help you schedule an appointment. Would you like to book a new appointment, reschedule an existing one, or check on your upcoming appointments?',
        'coral',
        '["collect_information", "schedule_callback", "send_sms"]',
        true
      ),
      (
        'tpl-faq',
        'FAQ Assistant',
        'faq',
        'Knowledge-based agent for answering frequently asked questions.',
        'You are a helpful FAQ assistant. Answer common questions clearly and concisely. If you don''t know the answer or the question requires human assistance, politely offer to transfer the caller to an appropriate department.',
        'Hello! I''m here to answer your questions. What would you like to know?',
        'alloy',
        '["transfer_to_extension", "transfer_to_queue"]',
        true
      ),
      (
        'tpl-after-hours',
        'After Hours',
        'after-hours',
        'Professional agent for handling calls outside business hours.',
        'You are an after-hours assistant. Let callers know that the office is currently closed and offer to take a message or schedule a callback for the next business day. Be apologetic about the timing but assure them their inquiry is important.',
        'Thank you for calling. Our office is currently closed, but I''d be happy to help. Would you like to leave a message or schedule a callback for our next business day?',
        'echo',
        '["schedule_callback", "collect_information", "send_sms"]',
        true
      )
      ON CONFLICT (id) DO NOTHING;

      CREATE INDEX IF NOT EXISTS idx_ai_agent_templates_category ON ai_agent_templates(category);
    `
  },
  {
    version: 21,
    name: 'add_ai_agent_metrics',
    up: `
      -- Daily metrics aggregation for AI agents
      -- Note: agent_id is TEXT to match ai_agents.id
      CREATE TABLE IF NOT EXISTS ai_agent_metrics (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        total_calls INTEGER DEFAULT 0,
        successful_calls INTEGER DEFAULT 0,
        transferred_calls INTEGER DEFAULT 0,
        abandoned_calls INTEGER DEFAULT 0,
        failed_calls INTEGER DEFAULT 0,
        avg_duration_seconds REAL DEFAULT 0,
        avg_sentiment REAL DEFAULT 0,
        total_turns INTEGER DEFAULT 0,
        total_cost_cents INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
        updated_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
        UNIQUE(agent_id, date)
      );

      CREATE INDEX IF NOT EXISTS idx_ai_agent_metrics_agent ON ai_agent_metrics(agent_id);
      CREATE INDEX IF NOT EXISTS idx_ai_agent_metrics_date ON ai_agent_metrics(date);
    `
  },
  {
    version: 22,
    name: 'add_caller_context',
    up: `
      -- Caller profiles for conversation memory
      CREATE TABLE IF NOT EXISTS ai_caller_profiles (
        caller_id TEXT PRIMARY KEY,
        name TEXT,
        total_calls INTEGER DEFAULT 0,
        last_call_at INTEGER,
        sentiment_avg REAL,
        topics TEXT,
        preferences TEXT,
        notes TEXT,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
        updated_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Conversation context for caller memory
      CREATE TABLE IF NOT EXISTS ai_conversation_context (
        id TEXT PRIMARY KEY,
        caller_id TEXT NOT NULL,
        agent_id TEXT,
        context_type TEXT NOT NULL CHECK(context_type IN ('caller_history', 'topic', 'preference', 'issue')),
        context_data TEXT NOT NULL,
        expires_at INTEGER,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
        UNIQUE(caller_id, context_type, agent_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ai_caller_profiles_last_call ON ai_caller_profiles(last_call_at);
      CREATE INDEX IF NOT EXISTS idx_ai_conversation_context_caller ON ai_conversation_context(caller_id);
    `
  },
  {
    version: 23,
    name: 'add_campaign_ai_agent_support',
    up: `
      -- Add AI agent and enhanced handler support to campaigns
      ALTER TABLE dialer_campaigns ADD COLUMN IF NOT EXISTS ai_agent_id TEXT REFERENCES ai_agents(id) ON DELETE SET NULL;
      ALTER TABLE dialer_campaigns ADD COLUMN IF NOT EXISTS ring_group_id TEXT;
      ALTER TABLE dialer_campaigns ADD COLUMN IF NOT EXISTS handler_type TEXT DEFAULT 'ivr' CHECK(handler_type IN ('ivr', 'ai_agent', 'ring_group', 'extension'));
      ALTER TABLE dialer_campaigns ADD COLUMN IF NOT EXISTS description TEXT;
      ALTER TABLE dialer_campaigns ADD COLUMN IF NOT EXISTS caller_id TEXT;
      ALTER TABLE dialer_campaigns ADD COLUMN IF NOT EXISTS amd_enabled BOOLEAN DEFAULT true;
      ALTER TABLE dialer_campaigns ADD COLUMN IF NOT EXISTS answering_machine_count INTEGER DEFAULT 0;

      -- Add answering_machine tracking to campaign_contacts
      ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS amd_detected BOOLEAN DEFAULT false;
      ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS amd_status TEXT;

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_dialer_campaigns_ai_agent ON dialer_campaigns(ai_agent_id);
      CREATE INDEX IF NOT EXISTS idx_dialer_campaigns_handler_type ON dialer_campaigns(handler_type);
    `
  },
  {
    version: 24,
    name: 'add_ai_agent_flow_builder',
    up: `
      -- Add flow builder columns to ai_agents
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS flow_enabled BOOLEAN DEFAULT false;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS flow_data TEXT;

      -- Flow execution state tracking table
      CREATE TABLE IF NOT EXISTS ai_flow_state (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
        agent_id TEXT NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
        current_node_id TEXT NOT NULL,
        variables TEXT DEFAULT '{}',
        visited_nodes TEXT DEFAULT '[]',
        branch_history TEXT DEFAULT '[]',
        state TEXT DEFAULT 'active' CHECK(state IN ('active', 'paused', 'waiting_input', 'completed', 'error')),
        error_message TEXT,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
        updated_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_ai_flow_state_conversation ON ai_flow_state(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_ai_flow_state_agent ON ai_flow_state(agent_id);
      CREATE INDEX IF NOT EXISTS idx_ai_flow_state_state ON ai_flow_state(state);
      CREATE INDEX IF NOT EXISTS idx_ai_agents_flow_enabled ON ai_agents(flow_enabled);
    `
  },
  {
    version: 25,
    name: 'add_elevenlabs_full_stack_support',
    up: `
      -- Add ElevenLabs full stack support columns
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS elevenlabs_model TEXT DEFAULT 'eleven_flash_v2_5';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS elevenlabs_voice_id TEXT;

      -- Update voice_provider and stt_provider constraints
      ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agents_voice_provider_check;
      ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agents_stt_provider_check;

      ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_voice_provider_check
        CHECK(voice_provider IN ('piper', 'elevenlabs', 'openai_realtime', 'elevenlabs_full', 'cartesia', 'google', 'deepgram'));
      ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_stt_provider_check
        CHECK(stt_provider IN ('deepgram', 'whisper', 'assemblyai', 'local_whisper', 'openai_realtime', 'elevenlabs_scribe'));

      CREATE INDEX IF NOT EXISTS idx_ai_agents_voice_provider ON ai_agents(voice_provider);
    `
  },
  {
    version: 26,
    name: 'add_queue_position_announcements',
    up: `
      -- Dynamic TTS position announcements for call queues
      ALTER TABLE queues ADD COLUMN IF NOT EXISTS position_announce_enabled BOOLEAN DEFAULT false;
      ALTER TABLE queues ADD COLUMN IF NOT EXISTS position_announce_voice TEXT;
      ALTER TABLE queues ADD COLUMN IF NOT EXISTS position_announce_provider TEXT DEFAULT 'elevenlabs';
      ALTER TABLE queues ADD COLUMN IF NOT EXISTS position_announce_language TEXT DEFAULT 'en';
      ALTER TABLE queues ADD COLUMN IF NOT EXISTS position_announce_interval INTEGER DEFAULT 60;
      ALTER TABLE queues ADD COLUMN IF NOT EXISTS position_announce_variations TEXT;

      CREATE INDEX IF NOT EXISTS idx_queues_position_announce ON queues(position_announce_enabled);
    `
  },
  {
    version: 27,
    name: 'add_contact_groups',
    up: `
      -- Contact Groups
      CREATE TABLE IF NOT EXISTS contact_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Group membership with global called tracking
      CREATE TABLE IF NOT EXISTS contact_group_members (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
        phone_number TEXT NOT NULL,
        name TEXT,
        called_at INTEGER,
        campaign_id TEXT,
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
        UNIQUE(group_id, phone_number)
      );

      -- Global DNC tracking
      CREATE TABLE IF NOT EXISTS global_dnc (
        phone_number TEXT PRIMARY KEY,
        first_called_at INTEGER NOT NULL,
        last_called_at INTEGER NOT NULL,
        call_count INTEGER DEFAULT 1,
        last_campaign_id TEXT,
        notes TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_contact_group_members_group ON contact_group_members(group_id);
      CREATE INDEX IF NOT EXISTS idx_contact_group_members_phone ON contact_group_members(phone_number);
      CREATE INDEX IF NOT EXISTS idx_contact_group_members_called ON contact_group_members(called_at);
      CREATE INDEX IF NOT EXISTS idx_global_dnc_last_called ON global_dnc(last_called_at);
    `
  },
  {
    version: 28,
    name: 'add_group_allow_redial',
    up: `
      ALTER TABLE contact_groups ADD COLUMN IF NOT EXISTS allow_redial BOOLEAN DEFAULT false;
    `
  },
  {
    version: 29,
    name: 'add_call_forwarding_and_dnd',
    up: `
      -- Call Forwarding settings for extensions
      ALTER TABLE extensions ADD COLUMN IF NOT EXISTS forward_enabled BOOLEAN DEFAULT false;
      ALTER TABLE extensions ADD COLUMN IF NOT EXISTS forward_destination TEXT;
      ALTER TABLE extensions ADD COLUMN IF NOT EXISTS forward_type TEXT DEFAULT 'always';
      ALTER TABLE extensions ADD COLUMN IF NOT EXISTS forward_timeout INTEGER DEFAULT 20;

      -- Do Not Disturb setting
      ALTER TABLE extensions ADD COLUMN IF NOT EXISTS dnd_enabled BOOLEAN DEFAULT false;

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_extensions_dnd ON extensions(dnd_enabled);
      CREATE INDEX IF NOT EXISTS idx_extensions_forward ON extensions(forward_enabled);
    `
  },
  {
    version: 30,
    name: 'add_multi_tenant_support',
    up: `
      -- =============================================================
      -- MULTI-TENANT SUPPORT
      -- =============================================================

      -- Tenants table (organizations/customers)
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'trial', 'cancelled')),

        -- Limits
        max_extensions INTEGER DEFAULT 100,
        max_concurrent_calls INTEGER DEFAULT 50,
        max_ai_minutes_monthly INTEGER DEFAULT 1000,
        max_campaigns INTEGER DEFAULT 10,
        max_trunks INTEGER DEFAULT 5,

        -- Usage tracking
        current_extensions INTEGER DEFAULT 0,
        current_ai_minutes_used INTEGER DEFAULT 0,

        -- Asterisk context prefix (for isolation)
        context_prefix TEXT NOT NULL,

        -- Billing (optional integration)
        billing_email TEXT,
        stripe_customer_id TEXT,
        plan TEXT DEFAULT 'starter' CHECK(plan IN ('starter', 'professional', 'enterprise', 'custom')),

        -- Settings
        settings TEXT DEFAULT '{}',

        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
        updated_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      -- Create default tenant for existing data
      INSERT INTO tenants (id, name, slug, status, context_prefix, max_extensions, max_concurrent_calls)
      VALUES ('default', 'Default Tenant', 'default', 'active', 'default', 1000, 100)
      ON CONFLICT (id) DO NOTHING;

      -- =============================================================
      -- ADD tenant_id TO ALL DATA TABLES
      -- =============================================================

      -- Extensions
      ALTER TABLE extensions ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_extensions_tenant ON extensions(tenant_id);

      -- IVR Menus
      ALTER TABLE ivr_menus ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_ivr_menus_tenant ON ivr_menus(tenant_id);

      -- IVR Options (inherits from menu, but add for direct queries)
      ALTER TABLE ivr_options ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_ivr_options_tenant ON ivr_options(tenant_id);

      -- Routing Rules
      ALTER TABLE routing_rules ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_routing_rules_tenant ON routing_rules(tenant_id);

      -- SIP Trunks
      ALTER TABLE sip_trunks ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_sip_trunks_tenant ON sip_trunks(tenant_id);

      -- Outbound Routes
      ALTER TABLE outbound_routes ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_outbound_routes_tenant ON outbound_routes(tenant_id);

      -- Ring Groups
      ALTER TABLE ring_groups ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_ring_groups_tenant ON ring_groups(tenant_id);

      -- Queues
      ALTER TABLE queues ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_queues_tenant ON queues(tenant_id);

      -- Prompts
      ALTER TABLE prompts ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_prompts_tenant ON prompts(tenant_id);

      -- Contacts
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);

      -- Contact Groups
      ALTER TABLE contact_groups ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_contact_groups_tenant ON contact_groups(tenant_id);

      -- Dialer Campaigns
      ALTER TABLE dialer_campaigns ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_dialer_campaigns_tenant ON dialer_campaigns(tenant_id);

      -- AI Agents
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_ai_agents_tenant ON ai_agents(tenant_id);

      -- AI Conversations
      ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_ai_conversations_tenant ON ai_conversations(tenant_id);

      -- Call Logs
      ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_call_logs_tenant ON call_logs(tenant_id);

      -- Call Recordings (if table exists)
      DO $$ BEGIN
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'call_recordings' AND table_schema = 'public') THEN
          ALTER TABLE call_recordings ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id);
          CREATE INDEX IF NOT EXISTS idx_call_recordings_tenant ON call_recordings(tenant_id);
        END IF;
      END $$;

      -- Voicemails
      ALTER TABLE voicemails ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_voicemails_tenant ON voicemails(tenant_id);

      -- Transcriptions
      ALTER TABLE transcriptions ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_transcriptions_tenant ON transcriptions(tenant_id);

      -- API Keys
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);

      -- Web Users (can belong to a tenant or be super-admin with NULL tenant_id)
      ALTER TABLE web_users ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_web_users_tenant ON web_users(tenant_id);

      -- =============================================================
      -- TENANT INVITATIONS
      -- =============================================================
      CREATE TABLE IF NOT EXISTS tenant_invitations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        role TEXT DEFAULT 'viewer' CHECK(role IN ('admin', 'supervisor', 'viewer')),
        token TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        accepted_at INTEGER,
        created_by INTEGER REFERENCES web_users(id),
        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_tenant_invitations_tenant ON tenant_invitations(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_tenant_invitations_token ON tenant_invitations(token);
      CREATE INDEX IF NOT EXISTS idx_tenant_invitations_email ON tenant_invitations(email);

      -- =============================================================
      -- TENANT USAGE TRACKING
      -- =============================================================
      CREATE TABLE IF NOT EXISTS tenant_usage (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        period TEXT NOT NULL,

        -- Call metrics
        total_calls INTEGER DEFAULT 0,
        total_call_minutes INTEGER DEFAULT 0,
        inbound_calls INTEGER DEFAULT 0,
        outbound_calls INTEGER DEFAULT 0,

        -- AI metrics
        ai_conversations INTEGER DEFAULT 0,
        ai_minutes_used INTEGER DEFAULT 0,
        ai_tokens_used INTEGER DEFAULT 0,

        -- Campaign metrics
        campaign_calls INTEGER DEFAULT 0,
        campaign_connected INTEGER DEFAULT 0,

        -- Storage
        recording_storage_bytes BIGINT DEFAULT 0,
        voicemail_storage_bytes BIGINT DEFAULT 0,

        created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
        updated_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,

        UNIQUE(tenant_id, period)
      );

      CREATE INDEX IF NOT EXISTS idx_tenant_usage_tenant ON tenant_usage(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_tenant_usage_period ON tenant_usage(period);

      -- =============================================================
      -- UPDATE EXISTING DATA TO DEFAULT TENANT
      -- =============================================================
      -- All existing data gets assigned to 'default' tenant
      UPDATE extensions SET tenant_id = 'default' WHERE tenant_id IS NULL;
      UPDATE ivr_menus SET tenant_id = 'default' WHERE tenant_id IS NULL;
      UPDATE ivr_options SET tenant_id = 'default' WHERE tenant_id IS NULL;
      UPDATE routing_rules SET tenant_id = 'default' WHERE tenant_id IS NULL;
      UPDATE sip_trunks SET tenant_id = 'default' WHERE tenant_id IS NULL;
      UPDATE outbound_routes SET tenant_id = 'default' WHERE tenant_id IS NULL;
      UPDATE ring_groups SET tenant_id = 'default' WHERE tenant_id IS NULL;
      UPDATE queues SET tenant_id = 'default' WHERE tenant_id IS NULL;
      UPDATE prompts SET tenant_id = 'default' WHERE tenant_id IS NULL;
      UPDATE contacts SET tenant_id = 'default' WHERE tenant_id IS NULL;
      UPDATE contact_groups SET tenant_id = 'default' WHERE tenant_id IS NULL;
      UPDATE dialer_campaigns SET tenant_id = 'default' WHERE tenant_id IS NULL;
      UPDATE ai_agents SET tenant_id = 'default' WHERE tenant_id IS NULL;
      UPDATE ai_conversations SET tenant_id = 'default' WHERE tenant_id IS NULL;
      UPDATE call_logs SET tenant_id = 'default' WHERE tenant_id IS NULL;
      DO $$ BEGIN
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'call_recordings' AND table_schema = 'public') THEN
          UPDATE call_recordings SET tenant_id = 'default' WHERE tenant_id IS NULL;
        END IF;
      END $$;
      UPDATE voicemails SET tenant_id = 'default' WHERE tenant_id IS NULL;
      UPDATE transcriptions SET tenant_id = 'default' WHERE tenant_id IS NULL;
      UPDATE api_keys SET tenant_id = 'default' WHERE tenant_id IS NULL;
    `
  },
  {
    version: 31,
    name: 'add_teams_and_extended_users',
    up: `
      -- =============================================================
      -- TEAMS FOR USER ORGANIZATION
      -- =============================================================

      -- Teams table
      CREATE TABLE IF NOT EXISTS teams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        description TEXT,
        color VARCHAR(20) DEFAULT 'blue',
        icon VARCHAR(50) DEFAULT 'users',
        queue_id TEXT REFERENCES queues(id) ON DELETE SET NULL,
        tenant_id TEXT DEFAULT 'default' REFERENCES tenants(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_teams_tenant ON teams(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_teams_queue ON teams(queue_id);

      -- Team members join table
      CREATE TABLE IF NOT EXISTS team_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
        role VARCHAR(50) DEFAULT 'member',
        joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(team_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
      CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

      -- =============================================================
      -- EXTENDED USER PROFILE FIELDS
      -- =============================================================

      ALTER TABLE web_users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
      ALTER TABLE web_users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
      ALTER TABLE web_users ADD COLUMN IF NOT EXISTS department VARCHAR(100);
      ALTER TABLE web_users ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE web_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    `
  },
  {
    version: 32,
    name: 'Add trunk selection to campaigns',
    up: `
      ALTER TABLE dialer_campaigns ADD COLUMN IF NOT EXISTS trunk_id TEXT REFERENCES sip_trunks(id) ON DELETE SET NULL;
    `
  }
];

/**
 * Run all pending migrations
 */
export async function runMigrations(db: DatabaseManager): Promise<void> {
  const currentVersion = await db.getSchemaVersion();
  dbLogger.info(`Current schema version: ${currentVersion}`);

  const pendingMigrations = migrations.filter((m) => m.version > currentVersion);

  if (pendingMigrations.length === 0) {
    dbLogger.info('Database schema is up to date');
    return;
  }

  dbLogger.info(`Running ${pendingMigrations.length} pending migration(s)`);

  for (const migration of pendingMigrations) {
    dbLogger.info(`Running migration ${migration.version}: ${migration.name}`);

    try {
      await db.exec(migration.up);
      await db.setSchemaVersion(migration.version);
      dbLogger.info(`Migration ${migration.version} completed successfully`);
    } catch (error) {
      dbLogger.error(`Migration ${migration.version} failed:`, error);
      throw error;
    }
  }

  const finalVersion = await db.getSchemaVersion();
  dbLogger.info(`Database schema updated to version ${finalVersion}`);
}

/**
 * Get current migration status
 */
export async function getMigrationStatus(db: DatabaseManager): Promise<{
  currentVersion: number;
  latestVersion: number;
  pendingCount: number;
}> {
  const currentVersion = await db.getSchemaVersion();
  const latestVersion = migrations.length > 0 ? migrations[migrations.length - 1].version : 0;
  const pendingCount = migrations.filter((m) => m.version > currentVersion).length;

  return {
    currentVersion,
    latestVersion,
    pendingCount,
  };
}
