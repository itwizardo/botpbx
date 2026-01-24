<p align="center">
  <img src="https://raw.githubusercontent.com/itwizardo/botpbx/main/web-admin/public/login.gif" alt="BotPBX Logo" width="200" />
</p>

<h1 align="center">BotPBX</h1>

<p align="center">
  <strong>A modern, open-source PBX for businesses of any size.</strong><br>
  Traditional phone system features + AI voice agents. Your choice.
  Designed and built by <a href="https://gwcwebdesign.com">GWC Web Design</a>
</p>

<p align="center">
  <a href="https://github.com/itwizardo/botpbx/stargazers"><img src="https://img.shields.io/github/stars/itwizardo/botpbx?style=social" alt="Stars"></a>
  <a href="https://github.com/itwizardo/botpbx/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License"></a>
  <a href="https://discord.gg/botpbx"><img src="https://img.shields.io/discord/1234567890?color=7289da&label=Discord&logo=discord&logoColor=white" alt="Discord"></a>
</p>

<p align="center">
  <a href="https://botpbx.com">Website</a> •
  <a href="https://botpbx.com/docs">Documentation</a> •
  <a href="https://discord.gg/botpbx">Discord</a> •
  <a href="https://github.com/itwizardo/botpbx/issues">Issues</a>
</p>

---

<p align="center">
  <img src="https://raw.githubusercontent.com/itwizardo/botpbx/main/web-admin/public/login.gif" alt="BotPBX Demo" width="600" />
</p>

---

## What is BotPBX?

BotPBX is a **complete phone system** built on Asterisk with a modern web interface. It works as a traditional PBX out of the box—extensions, voicemail, call queues, IVR menus, ring groups, call recording, and more. When you're ready, add AI voice agents that can handle calls, answer questions, and transfer to humans.

**Use it as:**
- A traditional office phone system
- A call center solution with queues and monitoring
- An AI-powered customer service platform
- A hybrid of all three

```bash
curl -sSL https://botpbx.com/install.sh | bash
```

<p align="center">
  <a href="https://github.com/itwizardo/botpbx"><img src="https://img.shields.io/badge/Star_on_GitHub-181717?style=for-the-badge&logo=github" alt="Star on GitHub"></a>
  <a href="https://discord.gg/botpbx"><img src="https://img.shields.io/badge/Join_Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join Discord"></a>
</p>

---

## Integrations

<p align="center">
  <img src="https://img.shields.io/badge/Anthropic-191919?style=for-the-badge&logo=anthropic&logoColor=white" alt="Anthropic" />
  <img src="https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white" alt="OpenAI" />
  <img src="https://img.shields.io/badge/Twilio-F22F46?style=for-the-badge&logo=twilio&logoColor=white" alt="Twilio" />
  <img src="https://img.shields.io/badge/Telnyx-00C389?style=for-the-badge" alt="Telnyx" />
  <img src="https://img.shields.io/badge/ElevenLabs-000000?style=for-the-badge" alt="ElevenLabs" />
  <img src="https://img.shields.io/badge/Deepgram-13EF93?style=for-the-badge" alt="Deepgram" />
  <img src="https://img.shields.io/badge/Groq-F55036?style=for-the-badge" alt="Groq" />
  <img src="https://img.shields.io/badge/VoIP.ms-0066CC?style=for-the-badge" alt="VoIP.ms" />
</p>

---

## Core PBX Features

BotPBX is first and foremost a **fully-featured PBX**. No AI required—just a solid, modern phone system.

### Extensions

Every user gets their own extension with a full feature set.

| Feature | Description |
|---------|-------------|
| **SIP Registration** | Connect any SIP phone, softphone, or mobile app |
| **Voicemail** | Personal voicemail box with customizable greetings |
| **Voicemail to Email** | Receive voicemails as email attachments |
| **Voicemail Transcription** | AI converts voicemails to readable text |
| **Call Forwarding** | Forward calls to mobile, another extension, or external number |
| **Call Waiting** | Handle multiple calls with call waiting tones |
| **Do Not Disturb** | Block incoming calls with a single toggle |
| **Follow-Me** | Ring multiple devices simultaneously or sequentially |
| **Caller ID** | Customizable outbound caller ID per extension |
| **Call Recording** | Record calls per extension (always, on-demand, or never) |
| **BLF Support** | Busy Lamp Field for monitoring other extensions |
| **Presence** | Real-time status (available, busy, away, DND) |

### Call Queues

Professional call center functionality for handling high call volumes.

| Feature | Description |
|---------|-------------|
| **6 Ring Strategies** | Ring All, Least Recent, Fewest Calls, Random, Round Robin, Linear |
| **Position Announcements** | "You are caller number 3 in the queue" |
| **Hold Time Estimates** | "Your estimated wait time is 2 minutes" |
| **Music on Hold** | Custom audio or streaming music while waiting |
| **Priority Levels** | VIP callers jump ahead in the queue |
| **Agent Penalties** | Control which agents get calls first |
| **Wrap-Up Time** | Give agents time between calls |
| **Max Wait Time** | Overflow to voicemail or another destination |
| **Queue Callbacks** | Let callers request a callback instead of waiting |
| **Real-Time Stats** | Live dashboard showing queue performance |
| **Agent Login/Logout** | Agents can join or leave queues dynamically |
| **Supervisor Monitoring** | Listen, whisper, or barge into active calls |

### Ring Groups

Distribute calls to groups of extensions.

| Feature | Description |
|---------|-------------|
| **Ring All** | All phones ring simultaneously |
| **Hunt** | Ring extensions one by one until answered |
| **Random** | Randomly select an extension to ring |
| **Round Robin** | Rotate through extensions evenly |
| **Ring Time** | Configurable ring duration per group |
| **Failover** | If no answer, route to voicemail, IVR, or another destination |
| **Skip Busy** | Automatically skip busy extensions |
| **Confirm Calls** | Require agents to press a key to accept |

### IVR (Auto Attendant)

Create professional phone menus with a visual drag-and-drop builder.

| Feature | Description |
|---------|-------------|
| **Visual Builder** | Drag-and-drop interface—no coding required |
| **DTMF Input** | "Press 1 for Sales, 2 for Support..." |
| **Speech Recognition** | Optional voice input for menu navigation |
| **Multi-Level Menus** | Nested submenus for complex routing |
| **Time Conditions** | Different greetings for business hours vs after hours |
| **Holiday Routing** | Special handling for holidays |
| **Custom Prompts** | Upload audio or use text-to-speech |
| **Variable Support** | Dynamic prompts based on caller data |
| **HTTP Requests** | Query external APIs during the call |
| **Conditional Branching** | Route based on caller ID, time, or custom logic |
| **Directory** | Dial-by-name company directory |
| **Callback Requests** | Let callers leave a callback request |

### Call Recording

Comprehensive recording for compliance, training, and quality assurance.

| Feature | Description |
|---------|-------------|
| **Global Recording** | Record all calls system-wide |
| **Per-Extension** | Enable/disable recording per user |
| **Per-Queue** | Record all queue calls |
| **On-Demand** | Agents can start/stop recording mid-call |
| **Pause/Resume** | Pause for sensitive information (credit cards, etc.) |
| **Storage Management** | Automatic cleanup of old recordings |
| **Playback** | Listen to recordings in the web interface |
| **Download** | Export recordings as MP3 or WAV |
| **Transcription** | AI transcribes recordings to searchable text |
| **Search** | Find recordings by date, caller, extension, or transcript content |

### Voicemail System

Full-featured voicemail for every extension.

| Feature | Description |
|---------|-------------|
| **Personal Greetings** | Custom unavailable and busy greetings |
| **Email Delivery** | Receive voicemails as email attachments |
| **Transcription** | AI converts voicemails to text |
| **Visual Voicemail** | Manage messages in the web interface |
| **PIN Protection** | Secure access to voicemail |
| **Message Forwarding** | Forward voicemails to other extensions |
| **Shared Mailboxes** | Group voicemail for departments |
| **Auto-Delete** | Automatic cleanup of old messages |
| **Unread Indicators** | BLF and MWI for new messages |
| **Remote Access** | Check voicemail from any phone |

### Inbound Call Routing

Flexible routing for incoming calls.

| Feature | Description |
|---------|-------------|
| **DID Routing** | Route each phone number to different destinations |
| **Time-Based Routing** | Business hours vs after hours |
| **Caller ID Routing** | VIP callers get special treatment |
| **Geographic Routing** | Route by area code or country |
| **Failover Chains** | Primary, secondary, tertiary destinations |
| **Blacklist/Whitelist** | Block or allow specific callers |
| **Anonymous Call Rejection** | Block calls with no caller ID |

### Outbound Call Routing

Control how calls leave your system.

| Feature | Description |
|---------|-------------|
| **Pattern Matching** | Route based on dialed number patterns |
| **Trunk Selection** | Choose which SIP trunk for each route |
| **Least Cost Routing** | Automatically use the cheapest carrier |
| **Failover** | If trunk fails, try the next one |
| **Digit Manipulation** | Strip or prepend digits before dialing |
| **Emergency Routing** | Special handling for 911/emergency calls |
| **International Restrictions** | Block expensive destinations |
| **PIN-Based Dialing** | Require authorization for long distance |

### SIP Trunking

Connect to any SIP provider.

| Feature | Description |
|---------|-------------|
| **Any Provider** | Twilio, Telnyx, VoIP.ms, Flowroute, or any SIP trunk |
| **Multiple Trunks** | Use different providers for different routes |
| **Trunk Registration** | Support for both registration and IP-based auth |
| **Codec Support** | G.711, G.729, Opus, and more |
| **T.38 Fax** | Fax over IP support |
| **DTMF Modes** | RFC2833, Inband, SIP INFO |
| **NAT Traversal** | Works behind firewalls |
| **Trunk Monitoring** | Real-time status and alerts |
| **Failover** | Automatic failover between trunks |
| **Load Balancing** | Distribute calls across multiple trunks |

---

## Browser Calling (WebRTC)

Make and receive calls directly from your web browser—no software to install.

| Feature | Description |
|---------|-------------|
| **Click-to-Call** | Call any number with one click |
| **Incoming Calls** | Receive calls in your browser |
| **HD Audio** | Opus codec at 48kHz for crystal-clear calls |
| **Call Controls** | Hold, transfer, mute, DTMF |
| **Call History** | Recent calls in the browser |
| **Contact Integration** | Click-to-call from contact list |
| **STUN/TURN** | Works on any network, even behind strict NAT |
| **Multi-Tab** | Use across browser tabs |

### Call Monitoring

Supervisors can monitor live calls in real-time.

| Feature | Description |
|---------|-------------|
| **Listen** | Silently listen to an active call |
| **Whisper** | Speak to the agent without the caller hearing |
| **Barge** | Join the call as a three-way conference |
| **Live Dashboard** | See all active calls in real-time |
| **Recording Controls** | Start/stop recording remotely |

---

## Outbound Campaigns

Automated dialing for sales, collections, surveys, and outreach.

| Feature | Description |
|---------|-------------|
| **Auto Dialer** | Automatically dial through contact lists |
| **AMD** | Answering Machine Detection—skip voicemails or leave messages |
| **Concurrent Calls** | Control how many calls dial simultaneously |
| **Calls Per Minute** | Throttle dialing rate |
| **Retry Logic** | Automatically retry no-answers and busy signals |
| **Retry Delays** | Configure wait time between retries |
| **Contact Import** | Upload contacts via CSV |
| **Contact Groups** | Organize contacts into segments |
| **DNC Compliance** | Do-not-call list management |
| **Campaign Scheduling** | Run campaigns at specific times |
| **Campaign Analytics** | Connected, voicemail, no answer, busy, failed stats |
| **Transfer Modes** | Connect to agents, IVRs, or AI agents |
| **Disposition Codes** | Track call outcomes |
| **Script Display** | Show call scripts to agents |

---

## AI Voice Agents

When you're ready to automate, add AI agents that can handle conversations naturally.

### LLM Providers

| Provider | Models | Best For |
|----------|--------|----------|
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku | Complex reasoning, nuanced conversations |
| **OpenAI** | GPT-4o, GPT-4o-mini | General purpose, fast responses |
| **Groq** | Llama 3.3 70B | Ultra-fast inference, cost-effective |

### AI Capabilities

| Feature | Description |
|---------|-------------|
| **Natural Conversations** | Agents understand context and handle complex requests |
| **Function Calling** | Agents can transfer calls, send SMS, schedule callbacks |
| **Visual Flow Builder** | Design agent behavior with drag-and-drop |
| **System Prompts** | Customize agent personality and instructions |
| **Knowledge Base** | Upload documents for agents to reference |
| **Conversation History** | Agents maintain context throughout the call |
| **Handoff to Human** | Seamless transfer when human help is needed |
| **Multi-Language** | Agents can speak multiple languages |

### OpenAI Realtime API

For the fastest voice responses, use OpenAI's Realtime API.

| Feature | Description |
|---------|-------------|
| **Sub-500ms Latency** | Near-instant responses for natural conversation |
| **Voice-to-Voice** | Direct speech input and output—no transcription delay |
| **Interruption Handling** | Callers can interrupt the agent naturally |
| **Emotion Detection** | Agents can detect and respond to caller emotions |

### AI Function Calling

Agents can take actions during calls.

| Action | Description |
|--------|-------------|
| **Transfer** | Transfer to an extension, queue, or external number |
| **Add to Queue** | Place caller in a call queue |
| **Send SMS** | Send text message to the caller |
| **Schedule Callback** | Book a callback appointment |
| **End Call** | Politely end the conversation |
| **Query API** | Fetch data from external systems |
| **Create Ticket** | Log issues in support systems |

---

## Text-to-Speech (TTS)

Generate natural-sounding voice prompts for IVRs, queues, and AI agents.

| Provider | Type | Voices | Latency | Best For |
|----------|------|--------|---------|----------|
| **Piper** | Local | 100+ | Very Low | Free, offline, fast |
| **Kokoro** | Local | 50+ | Low | High quality, offline |
| **ElevenLabs** | Cloud | 1000+ | Medium | Premium, cloned voices |
| **OpenAI** | Cloud | 6 | Low | Natural, consistent |
| **Google Cloud** | Cloud | 400+ | Low | Multi-language |
| **PlayHT** | Cloud | 800+ | Medium | Ultra-realistic |
| **Cartesia** | Cloud | 100+ | Very Low | Real-time streaming |

### TTS Features

| Feature | Description |
|---------|-------------|
| **Voice Preview** | Type a message and preview different voices |
| **SSML Support** | Control pronunciation, pauses, and emphasis |
| **Voice Cloning** | Clone custom voices (ElevenLabs) |
| **Multi-Language** | Support for 50+ languages |
| **Dynamic Generation** | Generate speech on-the-fly for queue announcements |
| **Audio Caching** | Cache generated audio for faster playback |

---

## Speech-to-Text (STT)

Transcribe calls and voicemails automatically.

| Provider | Accuracy | Latency | Best For |
|----------|----------|---------|----------|
| **Deepgram** | High | Real-time | Live transcription |
| **OpenAI Whisper** | Very High | Batch | Accuracy-critical |
| **AssemblyAI** | Very High | Near Real-time | Full-featured (diarization, summaries) |
| **Groq Whisper** | High | Very Fast | Speed-critical |

### STT Features

| Feature | Description |
|---------|-------------|
| **Live Transcription** | Real-time transcripts during calls |
| **Call Recording Transcription** | Automatic transcription of recordings |
| **Voicemail Transcription** | Convert voicemails to text |
| **Speaker Diarization** | Identify who said what |
| **Punctuation** | Automatic punctuation and formatting |
| **Custom Vocabulary** | Improve accuracy for industry terms |
| **Searchable** | Full-text search across all transcripts |
| **Export** | Download transcripts as text or SRT |

---

## AI Analytics & Insights

Turn call data into actionable intelligence.

### Call Analytics

| Metric | Description |
|--------|-------------|
| **Call Volume** | Hourly, daily, weekly, monthly trends |
| **Answer Rate** | Percentage of calls answered |
| **Abandonment Rate** | Calls that hung up before being answered |
| **Average Handle Time** | How long calls last |
| **Average Wait Time** | Time spent in queues |
| **Peak Hours** | Identify busiest times |
| **Agent Performance** | Calls handled, talk time, availability |
| **Queue Performance** | Service level, wait times, abandonment |

### AI Insights

| Feature | Description |
|---------|-------------|
| **Intent Classification** | Automatically categorize calls (Sales, Support, Billing, Complaints) |
| **Sentiment Analysis** | Detect caller emotions (positive, negative, neutral) |
| **FAQ Extraction** | Auto-generate FAQs from call transcripts |
| **Topic Detection** | Identify common discussion topics |
| **Call Summaries** | AI-generated summaries of every call |
| **Trend Analysis** | Track how topics and sentiment change over time |
| **Alerts** | Get notified about negative sentiment or trending issues |

### Agent Scoring

| Metric | Description |
|--------|-------------|
| **Success Rate** | Percentage of calls with positive outcomes |
| **Efficiency Score** | How quickly agents resolve issues |
| **Sentiment Score** | How callers feel after interacting |
| **Resolution Rate** | First-call resolution percentage |
| **Quality Score** | Composite score of all metrics |

---

## Administration

### Multi-Tenant

Run multiple organizations on a single installation.

| Feature | Description |
|---------|-------------|
| **Tenant Isolation** | Complete separation of data and configuration |
| **Tenant Branding** | Custom logos and colors per tenant |
| **Resource Limits** | Control extensions, trunks, and minutes per tenant |
| **Billing Integration** | Track usage per tenant |
| **Self-Service Portal** | Tenants manage their own users and settings |

### User Management

| Feature | Description |
|---------|-------------|
| **User Accounts** | Separate login for each admin user |
| **Role-Based Access** | Admin, Manager, Agent, Read-Only roles |
| **Custom Permissions** | Fine-grained access control |
| **Teams** | Organize users into departments |
| **Activity Logs** | Track who changed what |
| **Two-Factor Auth** | Optional 2FA for admin accounts |

### Global Search

Find anything instantly.

| Searchable | Examples |
|------------|----------|
| **Extensions** | Find by number, name, or email |
| **Contacts** | Search contact database |
| **Recordings** | Find by transcript content |
| **Call Logs** | Search by caller ID, date, duration |
| **Voicemails** | Find by transcript |
| **IVR Menus** | Search menu names and prompts |
| **Queues** | Find queues by name |
| **AI Agents** | Search agent names and prompts |

### Notifications

| Channel | Events |
|---------|--------|
| **Email** | Voicemail, missed calls, system alerts |
| **Telegram Bot** | Lead alerts, campaign notifications |
| **Webhook** | Send events to external systems |
| **In-App** | Real-time notifications in the dashboard |

---

## Developer Features

### REST API

Full API access to all system functions.

| Endpoint | Operations |
|----------|------------|
| `/api/extensions` | CRUD for extensions |
| `/api/queues` | Manage call queues |
| `/api/ring-groups` | Configure ring groups |
| `/api/ivr` | IVR menu management |
| `/api/trunks` | SIP trunk configuration |
| `/api/calls` | Call logs and active calls |
| `/api/recordings` | Recording access and management |
| `/api/voicemails` | Voicemail management |
| `/api/contacts` | Contact database |
| `/api/campaigns` | Campaign management |
| `/api/ai-agents` | AI agent configuration |
| `/api/analytics` | Call statistics and reports |

### WebSocket Events

Real-time updates for building integrations.

| Event | Description |
|-------|-------------|
| `call.new` | New call started |
| `call.answer` | Call was answered |
| `call.end` | Call ended |
| `call.transfer` | Call was transferred |
| `extension.status` | Extension status changed |
| `queue.update` | Queue statistics updated |
| `agent.conversation` | AI agent conversation turn |
| `voicemail.new` | New voicemail received |
| `recording.ready` | Recording finished processing |

### Webhooks

Trigger external systems on events.

```json
{
  "event": "call.end",
  "call_id": "abc123",
  "from": "+15551234567",
  "to": "100",
  "duration": 245,
  "recording_url": "https://..."
}
```

---

## Why We Built BotPBX

It started with frustration.

We needed a phone system—something modern, flexible, and easy to manage. So we did what anyone would do: we looked at what was out there.

**FreePBX** was the obvious first choice. Open source, battle-tested, tons of community support. But the moment we opened the interface, it felt like stepping back in time. The GUI looked like it hadn't been updated in a decade. Configuration was a maze of menus and cryptic options. Want to set up a simple IVR? Good luck navigating through dozens of screens. And don't even think about making changes without reading the wiki three times.

Then we looked at **3CX**. Polished interface, modern features, solid reputation. But then came the pricing page. Licenses per user, annual fees, enterprise tiers. For a growing team, the costs added up fast. And if you wanted the really good features? That's the enterprise tier. More money.

We also tried the cloud options—**Aircall, RingCentral, Dialpad**. Beautiful interfaces, sure. But locked into their ecosystem, expensive per-seat pricing, and zero flexibility. Want to customize something? Too bad. Want to self-host for compliance? Not an option.

But here's what really got us: **we wanted more**. Not just a basic phone system, but real tools that could help our team be more productive. We wanted:

- A system that could **transcribe every call automatically**—no more manual note-taking
- **Voice agents** that could answer common questions and route calls intelligently
- **An outbound dialer** to run sales and outreach campaigns without buying separate software
- **Calling campaigns** where AI could have real conversations, not just play recordings
- **Analytics** that actually told us what customers were asking about

We searched everywhere. FreePBX? No built-in dialer, no AI, and the "AI modules" were just basic speech recognition. Want a dialer? Buy a separate product. 3CX? They added some AI features, but it's a paid add-on with limited capabilities. Dialer? Also extra. Twilio? You could build something, but you'd need a team of developers and months of work just to get basic functionality.

**So we built it ourselves.**

BotPBX is the phone system we wished existed:

- **Modern interface** that doesn't make you want to throw your computer out the window
- **5-minute setup** instead of hours of configuration
- **All the traditional PBX features** you need—extensions, queues, IVR, recording, voicemail
- **Outbound dialer** for sales, collections, and outreach campaigns with answering machine detection
- **AI built in from day one**—transcription, voice agents, analytics, insights
- **Open source** so you can self-host, customize, and never worry about licensing fees
- **Any SIP provider** works—use Twilio, Telnyx, VoIP.ms, or whoever gives you the best rates

We're not trying to replace Asterisk—we love Asterisk. We're just putting a modern face on it and adding the AI capabilities that businesses actually need in 2024.

You can use BotPBX as a traditional phone system and never touch the AI features. Or you can go all-in with AI agents handling your calls. **Your choice.**

---

## How BotPBX Compares

### vs FreePBX

| | BotPBX | FreePBX |
|-|--------|---------|
| **Interface** | Modern web app | Dated PHP interface |
| **Setup** | 5 minutes | Hours of configuration |
| **AI Agents** | Built-in | Not available |
| **Transcription** | Built-in | Paid module |
| **Visual IVR** | Drag-and-drop | Text-based |
| **Browser Calling** | Built-in | Complex setup |
| **Updates** | One command | Manual process |

### vs 3CX

| | BotPBX | 3CX |
|-|--------|-----|
| **License** | MIT (free forever) | Per-user pricing |
| **Self-Hosting** | Full control | Limited features |
| **AI Agents** | Built-in | Paid add-on |
| **Open Source** | Yes | No |
| **Customization** | Unlimited | Restricted |
| **Multi-Tenant** | Built-in | Enterprise only |

### vs Twilio

| | BotPBX | Twilio |
|-|--------|--------|
| **Pricing** | Self-hosted (free) | Per-minute charges |
| **Carrier** | Any SIP provider | Twilio only |
| **PBX Features** | Complete system | Build from scratch |
| **AI Agents** | Visual builder | Custom code |
| **Data Ownership** | Your servers | Twilio's cloud |

---

## Quick Start

### Requirements

- Ubuntu 22.04+ or Debian 12+
- 4GB RAM minimum (8GB recommended)
- 2 CPU cores
- 20GB disk space
- Public IP address (for SIP connectivity)

### Installation

```bash
curl -sSL https://botpbx.com/install.sh | bash
```

The installer automatically:
- Installs Node.js 23, PostgreSQL, Asterisk 22, PM2, ffmpeg
- Configures PostgreSQL database with auto-generated credentials
- Configures Asterisk AMI, PJSIP, and dialplan
- Generates all security credentials (JWT, passwords)
- Builds backend and frontend
- Starts all services via PM2
- Creates default admin user

**Zero prompts - everything is generated automatically!**

### After Installation

1. Open `https://your-server-ip:3000` in your browser
2. Log in with the credentials shown at the end of installation
3. Add a SIP trunk (Twilio, Telnyx, VoIP.ms, etc.)
4. Create extensions for your users
5. Configure inbound routing for your phone numbers
6. Start making and receiving calls!

### Ports

| Port | Service | Protocol |
|------|---------|----------|
| 3000 | Backend API | TCP |
| 3001 | Frontend | TCP |
| 4573 | AGI Server | TCP |
| 5038 | Asterisk AMI | TCP |
| 5060 | SIP Signaling | UDP/TCP |
| 9092 | AudioSocket (AI) | TCP |
| 9093 | Browser Audio | TCP |
| 10000-20000 | RTP Media | UDP |

### Service Management

```bash
# View status
pm2 status

# View logs
pm2 logs

# Restart services
pm2 restart all

# Update BotPBX
git pull && npm install && npm run build && pm2 restart all
```

---

## Architecture

```
botpbx/
├── src/                          # Backend (Node.js/TypeScript)
│   ├── api/                      # Fastify REST API
│   │   ├── routes/               # 33+ API endpoint files
│   │   ├── middleware/           # Auth, tenant isolation
│   │   └── websocket.ts          # Real-time events
│   │
│   ├── ai/                       # AI Integration
│   │   ├── llm/                  # Claude, GPT, Groq providers
│   │   ├── stt/                  # Deepgram, Whisper, AssemblyAI
│   │   ├── functions/            # AI function calling
│   │   └── conversationEngine.ts # Conversation orchestration
│   │
│   ├── asterisk/                 # Asterisk Integration
│   │   ├── amiClient.ts          # AMI connection
│   │   ├── agiServer.ts          # AGI for call control
│   │   ├── audioSocketServer.ts  # Real-time audio streaming
│   │   └── ivrController.ts      # IVR execution engine
│   │
│   ├── services/                 # Business Logic
│   │   ├── ttsService.ts         # 7 TTS providers
│   │   ├── transcriptionService.ts
│   │   ├── dialerService.ts      # Campaign engine
│   │   ├── queueAnnouncementService.ts
│   │   └── ...                   # 20+ service files
│   │
│   └── db/                       # Data Layer
│       ├── database.ts           # PostgreSQL connection
│       ├── migrations.ts         # Schema management
│       └── repositories/         # 27 data access files
│
├── web-admin/                    # Frontend (Next.js)
│   └── src/
│       ├── app/                  # Pages and routing
│       │   ├── (dashboard)/      # Main application
│       │   │   ├── extensions/
│       │   │   ├── queues/
│       │   │   ├── ivr/
│       │   │   ├── ai-agents/
│       │   │   ├── campaigns/
│       │   │   ├── analytics/
│       │   │   └── settings/
│       │   └── (auth)/           # Authentication
│       ├── components/           # Reusable UI
│       └── stores/               # State management
│
└── config/                       # Configuration
```

### Technology Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js 23, TypeScript, Fastify |
| **Frontend** | Next.js 14, React, Tailwind CSS |
| **Database** | PostgreSQL 15 |
| **Telephony** | Asterisk 22, PJSIP |
| **Real-time** | WebSocket, AudioSocket |
| **AI** | Claude, GPT-4o, Groq |
| **TTS** | Piper, Kokoro, ElevenLabs, OpenAI, Google |
| **STT** | Deepgram, Whisper, AssemblyAI |

---

## Pricing

### Self-Hosted — **Free**

- MIT Licensed
- Unlimited extensions
- Unlimited AI agents
- Unlimited calls
- Community support
- Full source code access

### Managed Cloud — **$99/mo**

- Everything in Self-Hosted
- Hosted infrastructure
- Daily backups
- Automatic updates
- Priority email support
- 99.9% uptime SLA

[Start 7-Day Trial](https://botpbx.com/signup)

### Enterprise — **Custom**

- Custom SLAs
- Dedicated infrastructure
- SSO integration
- Audit logs
- White labeling
- Dedicated support

[Contact Sales](mailto:sales@botpbx.com)

---

## Contributing

BotPBX is open source and community-driven. We welcome contributions!

### Quick Start

```bash
git clone https://github.com/itwizardo/botpbx.git
cd botpbx
npm install
npm run dev
```

### Ways to Contribute

| Type | How |
|------|-----|
| **Report Bugs** | [Open an issue](https://github.com/itwizardo/botpbx/issues) |
| **Suggest Features** | [Start a discussion](https://github.com/itwizardo/botpbx/discussions) |
| **Improve Docs** | PRs welcome for documentation |
| **Submit Code** | Fix bugs or add features |
| **Translations** | Help translate the UI |

### Areas Needing Help

- Documentation improvements
- New TTS/STT provider integrations
- Test coverage
- UI/UX enhancements
- Translations to other languages

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## Documentation

- [Full Documentation](https://botpbx.com/docs)
- [Installation Guide](https://botpbx.com/docs/installation)
- [Configuration Guide](https://botpbx.com/docs/configuration)
- [API Reference](https://botpbx.com/docs/api)
- [AI Agents Guide](https://botpbx.com/docs/ai-agents)
- [Troubleshooting](https://botpbx.com/docs/troubleshooting)

---

## Community

- [Discord](https://discord.gg/botpbx) — Chat with the community
- [Twitter](https://twitter.com/botpbx) — Follow for updates
- [GitHub Discussions](https://github.com/itwizardo/botpbx/discussions) — Ask questions
- [Email](mailto:hello@botpbx.com) — Get in touch

---

## License

BotPBX is open source under the [MIT License](LICENSE).

---

<p align="center">
  <strong>Built with ❤️ by people who were tired of settling for less.</strong>
</p>

<p align="center">
  <a href="https://botpbx.com">botpbx.com</a>
</p>
