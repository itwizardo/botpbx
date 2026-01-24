# BotPBX Documentation

> Complete guide to installing, configuring, and using BotPBX - The AI-Powered Open Source PBX

---

## Table of Contents

1. [Introduction](#introduction)
2. [System Requirements](#system-requirements)
3. [Installation](#installation)
4. [Quick Start Guide](#quick-start-guide)
5. [Configuration](#configuration)
6. [SIP Trunks](#sip-trunks)
7. [Extensions](#extensions)
8. [AI Voice Agents](#ai-voice-agents)
9. [IVR Builder](#ivr-builder)
10. [Call Queues](#call-queues)
11. [Campaigns](#campaigns)
12. [AI Providers](#ai-providers)
13. [Text-to-Speech Engines](#text-to-speech-engines)
14. [Speech-to-Text Engines](#speech-to-text-engines)
15. [Call Recording & Transcription](#call-recording--transcription)
16. [Browser Calling (WebRTC)](#browser-calling-webrtc)
17. [REST API Reference](#rest-api-reference)
18. [WebSocket Events](#websocket-events)
19. [Environment Variables](#environment-variables)
20. [Service Management](#service-management)
21. [Security](#security)
22. [Troubleshooting](#troubleshooting)
23. [Upgrading](#upgrading)
24. [FAQ](#faq)

---

## Introduction

BotPBX is an open-source, AI-powered PBX (Private Branch Exchange) system built on top of Asterisk. It combines traditional telephony features with modern AI capabilities, including:

- **AI Voice Agents**: Intelligent agents that can handle calls, understand context, and integrate with business systems
- **Visual IVR Builder**: Drag-and-drop interface for creating call flows
- **Auto Transcription**: AI-powered transcription for all calls and voicemails
- **Browser Calling**: Make and receive calls directly from your web browser via WebRTC
- **Multi-Provider Support**: Works with any SIP trunk provider (Twilio, Telnyx, VoIP.ms, etc.)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        BotPBX Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Frontend   │    │   Backend    │    │   Asterisk   │       │
│  │  (Next.js)   │◄──►│  (Node.js)   │◄──►│    (PBX)     │       │
│  │  Port 3001   │    │  Port 3000   │    │              │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                             │                    │               │
│                             ▼                    ▼               │
│                      ┌──────────────┐    ┌──────────────┐       │
│                      │  PostgreSQL  │    │  SIP Trunks  │       │
│                      │  (Database)  │    │ (Providers)  │       │
│                      └──────────────┘    └──────────────┘       │
│                             │                                    │
│         ┌───────────────────┼───────────────────┐               │
│         ▼                   ▼                   ▼               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  AI Providers │    │  TTS Engines │    │  STT Engines │       │
│  │ Claude/GPT/  │    │ Piper/Eleven │    │  Deepgram/   │       │
│  │    Groq      │    │ Labs/Kokoro  │    │  AssemblyAI  │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## System Requirements

### Minimum Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Ubuntu 22.04 LTS / Debian 12 | Ubuntu 24.04 LTS |
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| Storage | 20 GB | 50+ GB SSD |
| Network | Public IP address | Static public IP |

### Supported Operating Systems

- Ubuntu 22.04 LTS (Jammy)
- Ubuntu 24.04 LTS (Noble)
- Debian 12 (Bookworm)
- Debian 11 (Bullseye)

### Network Requirements

The following ports must be accessible:

| Port | Protocol | Service | Description |
|------|----------|---------|-------------|
| 3000 | TCP | Backend API | REST API + WebSocket |
| 3001 | TCP | Frontend | Web Admin UI |
| 4573 | TCP | AGI Server | Asterisk Gateway Interface |
| 5038 | TCP | AMI | Asterisk Manager Interface |
| 5060 | UDP/TCP | SIP | SIP Signaling |
| 5061 | TCP | SIP TLS | Secure SIP Signaling |
| 9092 | TCP | AudioSocket | AI Realtime Audio |
| 9093 | TCP | Browser Audio | Call Monitoring WebSocket |
| 10000-20000 | UDP | RTP | Media (Audio) Traffic |

---

## Installation

### One-Line Installation

```bash
curl -sSL https://botpbx.com/install.sh | sh
```

Or install directly from GitHub:

```bash
curl -sSL https://raw.githubusercontent.com/itwizardo/botpbx/main/install.sh | sh
```

### Manual Installation

#### Step 1: Update System

```bash
sudo apt update && sudo apt upgrade -y
```

#### Step 2: Install Dependencies

```bash
# Install required packages
sudo apt install -y git curl wget build-essential libssl-dev libncurses5-dev \
    libnewt-dev libxml2-dev libsqlite3-dev libjansson-dev libcurl4-openssl-dev \
    uuid-dev libspeexdsp-dev libedit-dev pkg-config autoconf libtool \
    ffmpeg sox libsox-fmt-mp3 python3 python3-pip
```

#### Step 3: Install Node.js 23

```bash
curl -fsSL https://deb.nodesource.com/setup_23.x | sudo -E bash -
sudo apt install -y nodejs
```

#### Step 4: Install PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

#### Step 5: Install and Compile Asterisk 22

```bash
cd /usr/src
sudo wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-22-current.tar.gz
sudo tar xzf asterisk-22-current.tar.gz
cd asterisk-22*/

# Install prerequisites
sudo contrib/scripts/install_prereq install

# Configure with required modules
./configure --with-jansson-bundled --with-pjproject-bundled

# Select modules (enable codec_opus, res_ari, res_http_websocket)
make menuselect.makeopts
menuselect/menuselect --enable codec_opus --enable res_ari \
    --enable res_http_websocket --enable app_audiosocket menuselect.makeopts

# Compile and install
make -j$(nproc)
sudo make install
sudo make samples
sudo make config
sudo ldconfig
```

#### Step 6: Clone BotPBX

```bash
cd /opt
sudo git clone https://github.com/itwizardo/botpbx.git
cd botpbx
```

#### Step 7: Install NPM Dependencies

```bash
npm install
cd frontend && npm install && cd ..
```

#### Step 8: Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
nano .env
```

#### Step 9: Build and Start

```bash
# Build frontend
cd frontend && npm run build && cd ..

# Install PM2
sudo npm install -g pm2

# Start services
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### What the Installer Does

The automated installer performs these steps:

1. **System Update**: Updates package lists and upgrades existing packages
2. **Dependencies**: Installs build tools, libraries, and utilities
3. **Node.js 23**: Installs the latest Node.js LTS
4. **PostgreSQL**: Installs and configures the database
5. **Asterisk 22**: Compiles from source with required modules
6. **BotPBX**: Clones and configures the application
7. **TTS Engines**: Installs Piper TTS and optionally Kokoro TTS
8. **Security**: Generates JWT secrets, database credentials, AMI passwords
9. **Services**: Configures PM2 for process management
10. **Startup**: Enables services to start on boot

### Post-Installation

After installation completes, you'll see:

```
═══════════════════════════════════════════════════════════════════
                    INSTALLATION COMPLETE!
═══════════════════════════════════════════════════════════════════

BotPBX has been successfully installed!

Access your PBX at:
  → Frontend: https://YOUR-IP:3001
  → Backend API: https://YOUR-IP:3000

Default Admin Credentials:
  → Email: admin@botpbx.local
  → Password: [randomly-generated]

IMPORTANT: Save these credentials! They won't be shown again.

═══════════════════════════════════════════════════════════════════
```

---

## Quick Start Guide

### Step 1: Log In

1. Open your browser and navigate to `https://YOUR-SERVER-IP:3001`
2. Enter the admin credentials shown during installation
3. You'll land on the Dashboard

### Step 2: Add a SIP Trunk

1. Go to **Settings** → **SIP Trunks**
2. Click **Add Trunk**
3. Select your provider (Twilio, Telnyx, or Custom)
4. Enter your credentials:
   - **Trunk Name**: A friendly name (e.g., "Twilio Main")
   - **Host**: Your provider's SIP server
   - **Username**: Your SIP username
   - **Password**: Your SIP password
5. Click **Save**

### Step 3: Create an Extension

1. Go to **Extensions**
2. Click **Add Extension**
3. Enter:
   - **Extension Number**: e.g., 1001
   - **Name**: User's name
   - **Password**: SIP password for the phone
   - **Email**: For voicemail notifications
4. Click **Save**

### Step 4: Create Your First IVR

1. Go to **IVR Builder**
2. Click **Create New IVR**
3. Drag a **Play Message** node onto the canvas
4. Enter your greeting: "Welcome to our company. Press 1 for sales, 2 for support."
5. Add **DTMF Input** nodes for each option
6. Connect the nodes
7. Click **Save and Publish**

### Step 5: Route Incoming Calls

1. Go to **Inbound Routes**
2. Click **Add Route**
3. Enter the DID number from your trunk
4. Set the destination to your IVR
5. Click **Save**

### Step 6: Make a Test Call

1. Register a softphone (like Zoiper or Linphone) with your extension
2. Call your DID number from an external phone
3. Listen to your IVR greeting

---

## Configuration

### Main Configuration File

The main configuration is stored in `/opt/botpbx/.env`:

```bash
# Database
DATABASE_URL=postgresql://botpbx:password@localhost:5432/botpbx

# Server
PORT=3000
FRONTEND_PORT=3001
NODE_ENV=production

# Security
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRY=24h

# Asterisk
AMI_HOST=127.0.0.1
AMI_PORT=5038
AMI_USER=botpbx
AMI_SECRET=your-ami-secret

# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...

# TTS
ELEVENLABS_API_KEY=...
PIPER_HOST=127.0.0.1
PIPER_PORT=5000

# STT
DEEPGRAM_API_KEY=...
ASSEMBLYAI_API_KEY=...
```

### Asterisk Configuration Files

BotPBX manages Asterisk configuration in `/etc/asterisk/`:

| File | Purpose |
|------|---------|
| `pjsip.conf` | SIP endpoints, trunks, and transports |
| `extensions.conf` | Dialplan and call routing |
| `manager.conf` | AMI (Manager Interface) settings |
| `http.conf` | HTTP server for ARI |
| `ari.conf` | Asterisk REST Interface |
| `rtp.conf` | RTP port ranges |
| `voicemail.conf` | Voicemail settings |
| `queues.conf` | Call queue configuration |

### Database Schema

BotPBX uses PostgreSQL with the following main tables:

- `users` - Admin users and permissions
- `extensions` - Phone extensions
- `trunks` - SIP trunk configurations
- `ivrs` - IVR flow definitions
- `agents` - AI agent configurations
- `campaigns` - Outbound campaign settings
- `call_logs` - CDR (Call Detail Records)
- `recordings` - Call recording metadata
- `transcriptions` - Call transcriptions
- `voicemails` - Voicemail messages

---

## SIP Trunks

### Understanding SIP Trunks

A SIP trunk connects your PBX to the public telephone network (PSTN). It allows you to:
- Receive incoming calls on DID numbers
- Make outgoing calls to any phone number
- Send and receive SMS (with supported providers)

### Supported Providers

BotPBX works with any standard SIP provider. Here are setup guides for popular ones:

### Twilio

1. **Create a Twilio Account** at https://www.twilio.com
2. **Get a Phone Number** from the Twilio Console
3. **Create SIP Domain**:
   - Go to Voice → SIP Domains
   - Create a new domain (e.g., `yourcompany.sip.twilio.com`)
4. **Create Credential List**:
   - Add IP Access Control List with your server's IP
   - Or create username/password credentials
5. **In BotPBX**:
   ```
   Trunk Name: Twilio
   Host: yourcompany.sip.twilio.com
   Username: your-twilio-username
   Password: your-twilio-password
   Outbound Proxy: sip.twilio.com
   ```
6. **Point Number to SIP Domain** in Twilio Console

### Telnyx

1. **Create a Telnyx Account** at https://telnyx.com
2. **Create a SIP Connection**:
   - Go to SIP Connections → Add
   - Choose "Credentials" authentication
   - Note the username and password
3. **Buy a Phone Number** and assign to the connection
4. **In BotPBX**:
   ```
   Trunk Name: Telnyx
   Host: sip.telnyx.com
   Username: your-telnyx-username
   Password: your-telnyx-password
   Codec: opus,ulaw,alaw
   ```

### VoIP.ms

1. **Create a VoIP.ms Account** at https://voip.ms
2. **Create a Sub Account**:
   - Go to Main Menu → Sub Accounts
   - Create new sub account with password
3. **Buy a DID** and point to sub account
4. **In BotPBX**:
   ```
   Trunk Name: VoIPms
   Host: atlanta.voip.ms (or your nearest server)
   Username: your_subaccount
   Password: your_password
   Register: Yes
   ```

### Custom SIP Provider

For any other SIP provider:

```
Trunk Name: Custom
Host: sip.provider.com
Port: 5060
Username: your-username
Password: your-password
Auth Username: (if different)
Outbound Proxy: (if required)
Transport: UDP/TCP/TLS
Codec Priority: opus,g722,ulaw,alaw
Register: Yes/No
```

### Trunk Advanced Settings

| Setting | Description |
|---------|-------------|
| **DTMF Mode** | RFC2833 (default), Inband, SIP INFO, Auto |
| **Qualify** | Send OPTIONS to check trunk status |
| **Qualify Frequency** | How often to check (seconds) |
| **Direct Media** | Allow RTP to flow directly between endpoints |
| **Force rport** | Force response to originating port |
| **Rewrite Contact** | Rewrite Contact header for NAT |
| **T.38 Fax** | Enable T.38 fax passthrough |

### Outbound Routes

Configure which trunk to use for outgoing calls:

1. Go to **Outbound Routes**
2. Click **Add Route**
3. Configure:
   - **Name**: Route name
   - **Pattern**: Number pattern to match
   - **Trunk**: Which trunk to use
   - **Prepend**: Digits to add before dialing
   - **Strip**: Digits to remove from dialed number

#### Pattern Examples

| Pattern | Matches | Example |
|---------|---------|---------|
| `NXXNXXXXXX` | 10-digit US numbers | 2025551234 |
| `1NXXNXXXXXX` | 11-digit US with 1 | 12025551234 |
| `011.` | International (011+) | 0114412345678 |
| `XXXX` | 4-digit internal | 1001 |
| `_9NXXNXXXXXX` | Dial 9 for outside line | 92025551234 |

---

## Extensions

### Creating Extensions

Extensions are internal phone numbers for users:

1. Go to **Extensions**
2. Click **Add Extension**
3. Fill in:
   - **Extension**: Number (e.g., 1001)
   - **Name**: Display name
   - **Secret**: SIP password
   - **Email**: For voicemail
   - **Voicemail PIN**: 4-6 digit PIN
   - **Caller ID**: Outbound caller ID
   - **Ring Timeout**: Seconds before going to voicemail

### Extension Settings

| Setting | Description |
|---------|-------------|
| **Call Waiting** | Allow multiple simultaneous calls |
| **Do Not Disturb** | Send calls directly to voicemail |
| **Call Forward** | Forward all calls to another number |
| **Follow Me** | Ring multiple devices sequentially |
| **Recording** | Always, Never, or On Demand |

### Registering Phones

#### Softphones

**Zoiper** (Windows/Mac/Linux/Mobile):
1. Download from https://www.zoiper.com
2. Add new SIP account:
   - Domain: `your-server-ip`
   - Username: Extension number
   - Password: Extension secret
   - Port: 5060

**Linphone** (Windows/Mac/Linux/Mobile):
1. Download from https://www.linphone.org
2. Use SIP Account Assistant:
   - SIP Address: `extension@your-server-ip`
   - Password: Extension secret

#### IP Phones

Configure with these settings:
- **SIP Server**: Your server IP
- **SIP Port**: 5060
- **Username**: Extension number
- **Password**: Extension secret
- **Outbound Proxy**: Your server IP (if behind NAT)

### Voicemail

Voicemail is automatically enabled for each extension:

- **Access**: Dial `*97` from your extension
- **Check Other**: Dial `*98` and enter extension + PIN
- **Email**: Voicemails sent as email attachments
- **Transcription**: AI transcribes voicemails to text

#### Voicemail Settings

```
Max Message Length: 180 seconds
Max Messages: 100
Min Message Length: 3 seconds
Format: wav49 (GSM)
Email: Send, Delete After Email, or Keep
```

---

## AI Voice Agents

### What Are AI Voice Agents?

AI Voice Agents are intelligent virtual assistants that can:
- Answer incoming calls
- Understand natural language
- Have contextual conversations
- Transfer to humans when needed
- Integrate with external systems (CRM, databases)

### Creating an AI Agent

1. Go to **AI Agents**
2. Click **Create Agent**
3. Configure:

```yaml
Name: Reception Agent
Description: Handles incoming calls and routes to departments

AI Provider: Anthropic Claude
Model: claude-3-5-sonnet-20241022

Voice Settings:
  TTS Engine: ElevenLabs
  Voice: Rachel
  Speed: 1.0

STT Settings:
  Engine: Deepgram
  Language: en-US
  Model: nova-2

System Prompt: |
  You are a friendly receptionist for Acme Corp. Your job is to:
  - Greet callers warmly
  - Understand their needs
  - Route to the appropriate department:
    - Sales: ext 2001
    - Support: ext 2002
    - Billing: ext 2003
  - If uncertain, offer to take a message

  Keep responses concise and natural. Don't use technical jargon.
  Always confirm before transferring.

Max Conversation Turns: 20
Silence Timeout: 5 seconds
End Call Phrases: ["goodbye", "bye", "hang up"]
```

### Agent Capabilities

#### Function Calling

Agents can call external functions:

```javascript
// Define functions the agent can use
{
  "functions": [
    {
      "name": "lookup_customer",
      "description": "Look up customer by phone number",
      "parameters": {
        "phone": { "type": "string" }
      }
    },
    {
      "name": "schedule_appointment",
      "description": "Schedule an appointment",
      "parameters": {
        "date": { "type": "string" },
        "time": { "type": "string" },
        "service": { "type": "string" }
      }
    },
    {
      "name": "transfer_call",
      "description": "Transfer to extension or department",
      "parameters": {
        "destination": { "type": "string" }
      }
    }
  ]
}
```

#### Webhooks

Configure webhooks for events:

- **on_call_start**: When call connects to agent
- **on_call_end**: When call ends
- **on_transfer**: When agent transfers call
- **on_function_call**: When agent uses a function

```json
{
  "webhooks": {
    "on_call_end": "https://your-crm.com/api/call-log",
    "on_function_call": "https://your-api.com/agent-functions"
  }
}
```

### Agent Best Practices

1. **Keep prompts concise**: AI works better with clear, focused instructions
2. **Define boundaries**: Specify what the agent should NOT do
3. **Set transfer conditions**: Always have a path to human agents
4. **Test thoroughly**: Make test calls before going live
5. **Monitor conversations**: Review transcripts to improve prompts

### Agent Metrics

Track agent performance:

- **Average Handle Time**: Duration of AI conversations
- **Transfer Rate**: % of calls transferred to humans
- **Resolution Rate**: % of calls resolved by AI
- **Customer Satisfaction**: Post-call ratings
- **Error Rate**: Misunderstandings or failures

---

## IVR Builder

### Visual IVR Editor

The drag-and-drop IVR builder lets you create call flows visually:

1. Go to **IVR Builder**
2. Click **Create New IVR**
3. Drag nodes from the left panel
4. Connect nodes by clicking and dragging
5. Configure each node's settings
6. Click **Save and Publish**

### Available Nodes

#### Start Node
Entry point for the IVR. Every flow needs exactly one.

#### Play Message
Play audio to the caller:
- **Text**: Convert text to speech
- **Recording**: Upload or record audio
- **TTS Voice**: Select voice for text-to-speech

#### DTMF Input
Wait for caller to press digits:
- **Timeout**: Seconds to wait
- **Max Digits**: Maximum digits to accept
- **Terminator**: Key to end input (#)

#### Menu
Multi-option menu:
```
Press 1 for Sales
Press 2 for Support
Press 3 for Billing
Press 0 for Operator
```

#### Transfer
Transfer to destination:
- **Extension**: Internal extension
- **External**: External number
- **Queue**: Call queue
- **Agent**: AI agent

#### Voicemail
Send to voicemail:
- **Extension**: Leave message for extension
- **General**: General mailbox

#### Set Variable
Set a channel variable:
```
CUSTOMER_ID = ${CALLERID(num)}
PRIORITY = high
```

#### Branch
Conditional logic:
```
IF ${CUSTOMER_TYPE} == "vip"
  THEN → Priority Queue
  ELSE → Regular Queue
```

#### HTTP Request
Call external API:
```
URL: https://api.crm.com/customer/${CALLERID(num)}
Method: GET
Headers: { "Authorization": "Bearer xxx" }
```

#### Play Digits
Read back numbers:
- **Variable**: Number to read
- **Format**: "digits" or "number"

#### Time Condition
Route based on time:
```
Business Hours: Mon-Fri 9AM-5PM
  → Main Menu
After Hours:
  → After Hours Message
```

#### AI Agent
Hand off to AI voice agent:
- **Agent**: Select configured agent
- **Context**: Additional context to pass

### Example IVR Flow

```
┌─────────┐
│  Start  │
└────┬────┘
     │
     ▼
┌─────────────┐
│  Welcome    │  "Thanks for calling Acme Corp"
│  Message    │
└──────┬──────┘
       │
       ▼
┌──────────────┐
│    Menu      │  "Press 1 for Sales, 2 for Support"
└───────┬──────┘
        │
   ┌────┴────┐
   │         │
   ▼         ▼
┌──────┐  ┌──────┐
│ Opt1 │  │ Opt2 │
│Sales │  │Supp. │
└──┬───┘  └──┬───┘
   │         │
   ▼         ▼
┌──────┐  ┌──────┐
│Queue │  │Queue │
│Sales │  │Supp. │
└──────┘  └──────┘
```

---

## Call Queues

### Creating a Queue

1. Go to **Queues**
2. Click **Add Queue**
3. Configure:

```yaml
Name: Sales Queue
Strategy: Ring All
Timeout: 30
Retry: 5
Weight: 0

Members:
  - 1001 (penalty: 0)
  - 1002 (penalty: 0)
  - 1003 (penalty: 1)

Music on Hold: default
Announce Frequency: 30
Announce Position: yes
Join Empty: yes
Leave When Empty: no
```

### Queue Strategies

| Strategy | Description |
|----------|-------------|
| **Ring All** | Ring all available members |
| **Least Recent** | Ring member who least recently received a call |
| **Fewest Calls** | Ring member with fewest completed calls |
| **Random** | Ring random member |
| **Round Robin** | Take turns ringing members |
| **Linear** | Ring in order, always starting with first |

### Queue Announcements

Configure what callers hear while waiting:

- **Position Announcement**: "You are caller number 3"
- **Hold Time Announcement**: "Expected wait time is 5 minutes"
- **Periodic Announcement**: Custom message every N seconds
- **Music on Hold**: Background music while waiting

### Dynamic Queue TTS

BotPBX generates announcements dynamically:

```
"Thank you for holding. You are caller number ${QUEUEPOS}
in line. Your expected wait time is approximately ${QUEUEHOLDTIME}
minutes. Your call is important to us."
```

---

## Campaigns

### Outbound Campaigns

Automated outbound calling for:
- Sales outreach
- Appointment reminders
- Collections
- Surveys
- Emergency notifications

### Creating a Campaign

1. Go to **Campaigns**
2. Click **Create Campaign**
3. Configure:

```yaml
Name: Appointment Reminders
Type: Voice

Caller ID: +15551234567
Trunk: Twilio

Schedule:
  Start: 09:00
  End: 18:00
  Days: Mon-Fri
  Timezone: America/New_York

Dial Settings:
  Concurrent Calls: 5
  Retry Attempts: 3
  Retry Delay: 60 minutes
  Answer Timeout: 30 seconds
  AMD: Enabled

On Answer:
  Type: AI Agent
  Agent: Appointment Reminder Agent

On Voicemail:
  Type: Play Recording
  Recording: appointment_reminder.wav

On No Answer:
  Action: Retry Later
```

### Uploading Contacts

Upload contacts via CSV:

```csv
phone,first_name,last_name,appointment_date,appointment_time
+15551234567,John,Smith,2024-01-15,10:00 AM
+15559876543,Jane,Doe,2024-01-15,2:30 PM
```

Or add via API:

```bash
curl -X POST https://your-server:3000/api/campaigns/1/contacts \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "phone": "+15551234567",
      "variables": {
        "first_name": "John",
        "appointment_date": "January 15th"
      }
    }
  ]'
```

### AMD (Answering Machine Detection)

Detect if a human or machine answers:

```yaml
AMD Settings:
  Enabled: true
  Initial Silence: 2500ms
  Greeting: 1500ms
  After Greeting Silence: 800ms
  Total Analysis Time: 5000ms
  Min Word Length: 100ms
  Between Words Silence: 50ms
  Maximum Words: 3
  Silence Threshold: 256
```

### Campaign Analytics

Track campaign performance:

- **Total Calls**: Attempted calls
- **Connected**: Human answers
- **Voicemail**: Machine answers
- **No Answer**: Unanswered calls
- **Busy**: Busy signals
- **Failed**: Call failures
- **Conversion Rate**: Goal completions

---

## AI Providers

### Anthropic Claude

Claude models for natural conversations:

```yaml
Provider: Anthropic
API Key: sk-ant-api03-xxx
Model: claude-3-5-sonnet-20241022

Options:
  Temperature: 0.7
  Max Tokens: 1024
```

**Available Models:**
- `claude-3-5-sonnet-20241022` - Best balance of intelligence and speed
- `claude-3-opus-20240229` - Most capable, slower
- `claude-3-haiku-20240307` - Fastest, most economical

### OpenAI GPT

GPT models for diverse applications:

```yaml
Provider: OpenAI
API Key: sk-xxx
Model: gpt-4o

Options:
  Temperature: 0.7
  Max Tokens: 1024
```

**Available Models:**
- `gpt-4o` - Most capable multimodal
- `gpt-4o-mini` - Faster, cheaper
- `gpt-4-turbo` - Previous generation

### Groq

Ultra-fast inference with open models:

```yaml
Provider: Groq
API Key: gsk_xxx
Model: llama-3.3-70b-versatile

Options:
  Temperature: 0.7
  Max Tokens: 1024
```

**Available Models:**
- `llama-3.3-70b-versatile` - Best quality
- `llama-3.1-8b-instant` - Fastest
- `mixtral-8x7b-32768` - Good balance

### Provider Comparison

| Provider | Latency | Quality | Cost |
|----------|---------|---------|------|
| Groq Llama 3.3 70B | ~100ms | ★★★★☆ | $ |
| Claude 3.5 Sonnet | ~500ms | ★★★★★ | $$ |
| GPT-4o | ~600ms | ★★★★★ | $$$ |
| Claude 3 Haiku | ~200ms | ★★★☆☆ | $ |

---

## Text-to-Speech Engines

### Piper TTS (Local)

Free, local, fast TTS:

```yaml
Engine: Piper
Host: 127.0.0.1
Port: 5000

Voice: en_US-lessac-medium
Speed: 1.0
```

**Available Voices:**
- `en_US-lessac-medium` - Natural US English
- `en_US-amy-medium` - Female US English
- `en_US-ryan-medium` - Male US English
- `en_GB-alan-medium` - British English

### Kokoro TTS (Local)

High-quality emotional TTS:

```yaml
Engine: Kokoro
Host: 127.0.0.1
Port: 5001

Voice: af_bella
Speed: 1.0
```

**Available Voices:**
- `af_bella` - American Female
- `am_adam` - American Male
- `bf_emma` - British Female
- `bm_george` - British Male

### ElevenLabs (Cloud)

Premium, human-like voices:

```yaml
Engine: ElevenLabs
API Key: xxx

Voice: Rachel
Model: eleven_turbo_v2
Stability: 0.5
Similarity: 0.75
Style: 0.5
```

**Popular Voices:**
- Rachel - Warm, professional
- Drew - Friendly, confident
- Clyde - Deep, authoritative
- Sarah - Youthful, energetic

### OpenAI TTS (Cloud)

High-quality neural voices:

```yaml
Engine: OpenAI
API Key: sk-xxx

Voice: nova
Model: tts-1
Speed: 1.0
```

**Available Voices:**
- `alloy` - Neutral
- `echo` - Male
- `fable` - British
- `onyx` - Deep male
- `nova` - Female
- `shimmer` - Soft female

### Google Cloud TTS (Cloud)

Wide language support:

```yaml
Engine: Google
Credentials: path/to/service-account.json

Voice: en-US-Neural2-F
Speaking Rate: 1.0
Pitch: 0
```

### Engine Comparison

| Engine | Latency | Quality | Cost | Local |
|--------|---------|---------|------|-------|
| Piper | ~50ms | ★★★☆☆ | Free | Yes |
| Kokoro | ~100ms | ★★★★☆ | Free | Yes |
| ElevenLabs | ~200ms | ★★★★★ | $$ | No |
| OpenAI | ~300ms | ★★★★☆ | $ | No |
| Google | ~200ms | ★★★★☆ | $ | No |

---

## Speech-to-Text Engines

### Deepgram

Fast, accurate STT:

```yaml
Engine: Deepgram
API Key: xxx

Model: nova-2
Language: en-US
Tier: enhanced

Options:
  Punctuate: true
  Diarize: false
  Smart Format: true
  Profanity Filter: false
```

**Models:**
- `nova-2` - Latest, most accurate
- `nova` - Fast and accurate
- `base` - Economical

### AssemblyAI

Full-featured STT:

```yaml
Engine: AssemblyAI
API Key: xxx

Model: best
Language: en

Options:
  Punctuate: true
  Format Text: true
  Speaker Labels: true
  Word Boost: ["BotPBX", "Asterisk"]
```

### Groq Whisper

Fast Whisper inference:

```yaml
Engine: Groq Whisper
API Key: gsk_xxx

Model: whisper-large-v3
Language: en

Options:
  Temperature: 0
  Response Format: json
```

### Google Speech-to-Text

Enterprise-grade STT:

```yaml
Engine: Google
Credentials: path/to/service-account.json

Model: latest_long
Language: en-US

Options:
  Automatic Punctuation: true
  Profanity Filter: false
  Word Time Offsets: true
```

### Engine Comparison

| Engine | Latency | Accuracy | Cost |
|--------|---------|----------|------|
| Deepgram Nova-2 | ~100ms | ★★★★★ | $$ |
| Groq Whisper | ~200ms | ★★★★☆ | $ |
| AssemblyAI | ~300ms | ★★★★★ | $$ |
| Google | ~200ms | ★★★★☆ | $$ |

---

## Call Recording & Transcription

### Enabling Recording

Configure recording at different levels:

**Global Settings:**
```yaml
Recording:
  Enabled: true
  Format: wav
  Path: /var/spool/asterisk/recording
  Beep: false
```

**Per Extension:**
```yaml
Extension: 1001
Recording: Always | On Demand | Never
```

**Per Queue:**
```yaml
Queue: Sales
Recording: yes
```

### Recording Storage

Recordings are stored in:
```
/var/spool/asterisk/recording/YYYY/MM/DD/
```

Filename format:
```
1705123456.789-1001-15551234567.wav
[timestamp]-[extension]-[callerid].wav
```

### Auto Transcription

Enable automatic transcription:

```yaml
Transcription:
  Enabled: true
  Engine: Deepgram
  Language: en-US

  On Complete:
    - Save to Database
    - Send Webhook
    - Email Summary
```

### Transcription Webhooks

Receive transcription data:

```json
POST /your-webhook
{
  "call_id": "abc123",
  "timestamp": "2024-01-15T10:30:00Z",
  "duration": 125,
  "from": "+15551234567",
  "to": "1001",
  "transcription": {
    "text": "Full transcription text...",
    "confidence": 0.95,
    "words": [
      {"word": "Hello", "start": 0.0, "end": 0.5},
      ...
    ]
  }
}
```

---

## Browser Calling (WebRTC)

### Enabling WebRTC

BotPBX supports browser-based calling via WebRTC:

1. Go to **Settings** → **WebRTC**
2. Enable WebRTC
3. Configure STUN/TURN servers (for NAT traversal)

```yaml
WebRTC:
  Enabled: true
  Port: 8089
  Certificate: /etc/asterisk/keys/asterisk.pem

  STUN:
    - stun:stun.l.google.com:19302

  TURN:
    Server: turn:turn.yourserver.com:3478
    Username: turnuser
    Password: turnpass
```

### Using the Web Phone

1. Log into BotPBX web interface
2. Click the phone icon in the header
3. Allow microphone access
4. Dial a number or click to call

### Features

- **Click-to-Call**: Click any phone number to dial
- **Call Hold**: Put calls on hold
- **Transfer**: Blind and attended transfer
- **Mute**: Mute your microphone
- **DTMF**: Send touch-tones
- **Call History**: Recent calls list

### Call Monitoring

Listen to live calls from the browser:

1. Go to **Live Calls**
2. Click on an active call
3. Select monitoring mode:
   - **Listen**: Hear both parties (spy)
   - **Whisper**: Speak to agent only
   - **Barge**: Join the conversation

---

## REST API Reference

### Authentication

All API requests require a JWT token:

```bash
# Get token
curl -X POST https://your-server:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "xxx"}'

# Response
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": 1, "email": "admin@example.com" }
}

# Use token in requests
curl https://your-server:3000/api/extensions \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

### Extensions

```bash
# List all extensions
GET /api/extensions

# Get single extension
GET /api/extensions/:id

# Create extension
POST /api/extensions
{
  "extension": "1001",
  "name": "John Smith",
  "secret": "password123",
  "email": "john@example.com"
}

# Update extension
PUT /api/extensions/:id
{
  "name": "John D. Smith"
}

# Delete extension
DELETE /api/extensions/:id
```

### Trunks

```bash
# List trunks
GET /api/trunks

# Create trunk
POST /api/trunks
{
  "name": "Twilio",
  "host": "sip.twilio.com",
  "username": "user",
  "password": "pass"
}

# Update trunk
PUT /api/trunks/:id

# Delete trunk
DELETE /api/trunks/:id

# Test trunk
POST /api/trunks/:id/test
```

### IVRs

```bash
# List IVRs
GET /api/ivrs

# Get IVR
GET /api/ivrs/:id

# Create IVR
POST /api/ivrs
{
  "name": "Main Menu",
  "flow": { ... }  // Flow builder JSON
}

# Update IVR
PUT /api/ivrs/:id

# Delete IVR
DELETE /api/ivrs/:id

# Publish IVR
POST /api/ivrs/:id/publish
```

### AI Agents

```bash
# List agents
GET /api/agents

# Get agent
GET /api/agents/:id

# Create agent
POST /api/agents
{
  "name": "Reception",
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "system_prompt": "You are...",
  "tts_engine": "elevenlabs",
  "tts_voice": "Rachel",
  "stt_engine": "deepgram"
}

# Update agent
PUT /api/agents/:id

# Delete agent
DELETE /api/agents/:id
```

### Campaigns

```bash
# List campaigns
GET /api/campaigns

# Create campaign
POST /api/campaigns
{
  "name": "Appointment Reminders",
  "trunk_id": 1,
  "caller_id": "+15551234567",
  "agent_id": 1,
  "schedule": {
    "start": "09:00",
    "end": "18:00",
    "days": ["mon", "tue", "wed", "thu", "fri"]
  }
}

# Add contacts
POST /api/campaigns/:id/contacts
[
  {"phone": "+15551234567", "variables": {...}},
  {"phone": "+15559876543", "variables": {...}}
]

# Start campaign
POST /api/campaigns/:id/start

# Pause campaign
POST /api/campaigns/:id/pause

# Stop campaign
POST /api/campaigns/:id/stop

# Get statistics
GET /api/campaigns/:id/stats
```

### Call Logs

```bash
# List call logs
GET /api/calls?start=2024-01-01&end=2024-01-31

# Get call details
GET /api/calls/:id

# Get call recording
GET /api/calls/:id/recording

# Get call transcription
GET /api/calls/:id/transcription
```

### Originate Call

```bash
# Start a new call
POST /api/calls/originate
{
  "from": "1001",
  "to": "+15551234567",
  "caller_id": "+15559999999",
  "timeout": 30
}
```

### System

```bash
# Get system status
GET /api/system/status

# Get Asterisk status
GET /api/system/asterisk

# Reload Asterisk config
POST /api/system/asterisk/reload

# Get live channels
GET /api/system/channels
```

---

## WebSocket Events

### Connection

Connect to WebSocket for real-time events:

```javascript
const ws = new WebSocket('wss://your-server:3000/ws');

ws.onopen = () => {
  // Authenticate
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'your-jwt-token'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data);
};
```

### Event Types

#### call.new
New call started:
```json
{
  "event": "call.new",
  "data": {
    "call_id": "1705123456.789",
    "from": "+15551234567",
    "to": "1001",
    "direction": "inbound",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

#### call.answer
Call answered:
```json
{
  "event": "call.answer",
  "data": {
    "call_id": "1705123456.789",
    "answered_by": "1001",
    "timestamp": "2024-01-15T10:30:05Z"
  }
}
```

#### call.end
Call ended:
```json
{
  "event": "call.end",
  "data": {
    "call_id": "1705123456.789",
    "duration": 125,
    "disposition": "ANSWERED",
    "timestamp": "2024-01-15T10:32:10Z"
  }
}
```

#### call.transfer
Call transferred:
```json
{
  "event": "call.transfer",
  "data": {
    "call_id": "1705123456.789",
    "from": "1001",
    "to": "1002",
    "type": "blind"
  }
}
```

#### extension.status
Extension status changed:
```json
{
  "event": "extension.status",
  "data": {
    "extension": "1001",
    "status": "busy",
    "previous": "available"
  }
}
```

#### queue.update
Queue statistics updated:
```json
{
  "event": "queue.update",
  "data": {
    "queue": "sales",
    "calls_waiting": 3,
    "agents_available": 2,
    "longest_wait": 45
  }
}
```

#### agent.conversation
AI agent conversation update:
```json
{
  "event": "agent.conversation",
  "data": {
    "call_id": "1705123456.789",
    "agent": "Reception",
    "turn": 3,
    "user_text": "I need to speak with sales",
    "agent_text": "Of course, I'll transfer you to our sales team."
  }
}
```

### Subscribing to Events

Subscribe to specific events:

```javascript
// Subscribe to all call events
ws.send(JSON.stringify({
  type: 'subscribe',
  events: ['call.*']
}));

// Subscribe to specific extension
ws.send(JSON.stringify({
  type: 'subscribe',
  events: ['extension.1001.*']
}));

// Subscribe to queue
ws.send(JSON.stringify({
  type: 'subscribe',
  events: ['queue.sales.*']
}));
```

---

## Environment Variables

### Complete .env Reference

```bash
#=============================================================================
# DATABASE
#=============================================================================
DATABASE_URL=postgresql://botpbx:password@localhost:5432/botpbx
DATABASE_SSL=false
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

#=============================================================================
# SERVER
#=============================================================================
PORT=3000
FRONTEND_PORT=3001
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info

#=============================================================================
# SECURITY
#=============================================================================
JWT_SECRET=your-256-bit-secret
JWT_EXPIRY=24h
BCRYPT_ROUNDS=12
CORS_ORIGIN=*
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100

#=============================================================================
# ASTERISK
#=============================================================================
AMI_HOST=127.0.0.1
AMI_PORT=5038
AMI_USER=botpbx
AMI_SECRET=your-ami-password

AGI_HOST=127.0.0.1
AGI_PORT=4573

ASTERISK_SPOOL=/var/spool/asterisk
ASTERISK_SOUNDS=/var/lib/asterisk/sounds
ASTERISK_RECORDING=/var/spool/asterisk/recording

#=============================================================================
# AI PROVIDERS
#=============================================================================
# Anthropic
ANTHROPIC_API_KEY=sk-ant-api03-xxx
ANTHROPIC_DEFAULT_MODEL=claude-3-5-sonnet-20241022

# OpenAI
OPENAI_API_KEY=sk-xxx
OPENAI_DEFAULT_MODEL=gpt-4o

# Groq
GROQ_API_KEY=gsk_xxx
GROQ_DEFAULT_MODEL=llama-3.3-70b-versatile

#=============================================================================
# TEXT-TO-SPEECH
#=============================================================================
# Piper (Local)
PIPER_HOST=127.0.0.1
PIPER_PORT=5000
PIPER_DEFAULT_VOICE=en_US-lessac-medium

# Kokoro (Local)
KOKORO_HOST=127.0.0.1
KOKORO_PORT=5001
KOKORO_DEFAULT_VOICE=af_bella

# ElevenLabs (Cloud)
ELEVENLABS_API_KEY=xxx
ELEVENLABS_DEFAULT_VOICE=Rachel
ELEVENLABS_MODEL=eleven_turbo_v2

# OpenAI TTS (Cloud)
OPENAI_TTS_MODEL=tts-1
OPENAI_TTS_VOICE=nova

# Google TTS (Cloud)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GOOGLE_TTS_VOICE=en-US-Neural2-F

#=============================================================================
# SPEECH-TO-TEXT
#=============================================================================
# Deepgram
DEEPGRAM_API_KEY=xxx
DEEPGRAM_MODEL=nova-2
DEEPGRAM_LANGUAGE=en-US

# AssemblyAI
ASSEMBLYAI_API_KEY=xxx

# Groq Whisper
GROQ_WHISPER_MODEL=whisper-large-v3

#=============================================================================
# AUDIO PROCESSING
#=============================================================================
AUDIOSOCKET_HOST=0.0.0.0
AUDIOSOCKET_PORT=9092
BROWSER_AUDIO_PORT=9093
AUDIO_FORMAT=slin16
AUDIO_SAMPLE_RATE=16000

#=============================================================================
# RECORDING & STORAGE
#=============================================================================
RECORDING_ENABLED=true
RECORDING_FORMAT=wav
RECORDING_PATH=/var/spool/asterisk/recording
TRANSCRIPTION_ENABLED=true
STORAGE_TYPE=local
# For S3 storage:
# STORAGE_TYPE=s3
# S3_BUCKET=your-bucket
# S3_REGION=us-east-1
# AWS_ACCESS_KEY_ID=xxx
# AWS_SECRET_ACCESS_KEY=xxx

#=============================================================================
# EMAIL (for voicemail notifications)
#=============================================================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=BotPBX <noreply@your-domain.com>

#=============================================================================
# WEBHOOKS
#=============================================================================
WEBHOOK_SECRET=your-webhook-signing-secret
WEBHOOK_TIMEOUT=5000
WEBHOOK_RETRY_COUNT=3
```

---

## Service Management

### PM2 Commands

BotPBX runs as PM2 processes:

```bash
# View all processes
pm2 status

# View logs
pm2 logs                    # All logs
pm2 logs botpbx            # Backend only
pm2 logs botpbx-web        # Frontend only
pm2 logs piper-tts         # Piper TTS
pm2 logs kokoro-tts        # Kokoro TTS

# Restart services
pm2 restart all
pm2 restart botpbx
pm2 restart botpbx-web

# Stop services
pm2 stop all
pm2 stop botpbx

# Start services
pm2 start all
pm2 start botpbx

# Monitor real-time
pm2 monit

# Flush logs
pm2 flush
```

### Asterisk Commands

```bash
# Start/Stop/Restart
sudo systemctl start asterisk
sudo systemctl stop asterisk
sudo systemctl restart asterisk
sudo systemctl status asterisk

# Asterisk CLI
sudo asterisk -rvvv

# Common CLI commands
core show channels          # Active calls
sip show peers             # SIP endpoints
pjsip show endpoints       # PJSIP endpoints
queue show                 # Queue status
core reload                # Reload config
module reload res_pjsip.so # Reload specific module
```

### PostgreSQL Commands

```bash
# Start/Stop/Restart
sudo systemctl start postgresql
sudo systemctl stop postgresql
sudo systemctl restart postgresql

# Access database
sudo -u postgres psql botpbx

# Backup database
pg_dump -U botpbx botpbx > backup.sql

# Restore database
psql -U botpbx botpbx < backup.sql
```

### Checking Logs

```bash
# PM2 logs
tail -f ~/.pm2/logs/botpbx-out.log
tail -f ~/.pm2/logs/botpbx-error.log

# Asterisk logs
tail -f /var/log/asterisk/messages
tail -f /var/log/asterisk/full

# System logs
journalctl -u asterisk -f
journalctl -u postgresql -f
```

### Ecosystem Config

The PM2 ecosystem file (`ecosystem.config.js`):

```javascript
module.exports = {
  apps: [
    {
      name: 'botpbx',
      script: 'dist/index.js',
      cwd: '/opt/botpbx',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'botpbx-web',
      script: 'npm',
      args: 'start',
      cwd: '/opt/botpbx/frontend',
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    },
    {
      name: 'piper-tts',
      script: 'python3',
      args: '-m piper.http_server --model /opt/piper/voices/en_US-lessac-medium.onnx',
      cwd: '/opt/piper',
      instances: 1,
      autorestart: true
    }
  ]
};
```

---

## Security

### Firewall Configuration

Recommended UFW rules:

```bash
# Allow SSH
ufw allow 22/tcp

# Allow HTTP/HTTPS (if using reverse proxy)
ufw allow 80/tcp
ufw allow 443/tcp

# Allow BotPBX
ufw allow 3000/tcp  # Backend API
ufw allow 3001/tcp  # Frontend

# Allow SIP
ufw allow 5060/udp  # SIP
ufw allow 5061/tcp  # SIP TLS

# Allow RTP
ufw allow 10000:20000/udp  # Media

# Enable firewall
ufw enable
```

### SSL/TLS Certificates

Generate Let's Encrypt certificates:

```bash
# Install certbot
apt install certbot

# Get certificate
certbot certonly --standalone -d pbx.yourdomain.com

# Certificate locations
/etc/letsencrypt/live/pbx.yourdomain.com/fullchain.pem
/etc/letsencrypt/live/pbx.yourdomain.com/privkey.pem
```

Configure in BotPBX:

```bash
# .env
SSL_ENABLED=true
SSL_CERT=/etc/letsencrypt/live/pbx.yourdomain.com/fullchain.pem
SSL_KEY=/etc/letsencrypt/live/pbx.yourdomain.com/privkey.pem
```

### Fail2ban

Protect against brute force:

```bash
# Install
apt install fail2ban

# Configure Asterisk jail
cat > /etc/fail2ban/jail.d/asterisk.conf << 'EOF'
[asterisk]
enabled = true
port = 5060,5061
filter = asterisk
logpath = /var/log/asterisk/messages
maxretry = 5
bantime = 3600
EOF

# Restart
systemctl restart fail2ban
```

### Best Practices

1. **Change default passwords** immediately after installation
2. **Use strong JWT secrets** (256+ bits)
3. **Enable TLS** for SIP connections
4. **Restrict API access** to trusted IPs
5. **Regular backups** of database and recordings
6. **Keep software updated** (OS, Node.js, Asterisk)
7. **Monitor logs** for suspicious activity
8. **Use VPN** for remote management

---

## Troubleshooting

### Common Issues

#### Calls Not Connecting

1. **Check trunk registration:**
   ```bash
   asterisk -rx "pjsip show registrations"
   ```

2. **Check firewall:**
   ```bash
   ufw status
   iptables -L -n
   ```

3. **Check RTP ports:**
   ```bash
   netstat -ulnp | grep asterisk
   ```

4. **Enable SIP debugging:**
   ```bash
   asterisk -rx "pjsip set logger on"
   ```

#### No Audio (One-Way or No Audio)

1. **NAT issues** - Ensure `force_rport` and `rewrite_contact` are enabled
2. **RTP ports blocked** - Open ports 10000-20000 UDP
3. **Codec mismatch** - Check supported codecs on both ends

```bash
# Check active channels
asterisk -rx "core show channels verbose"

# Check codec negotiation
asterisk -rx "pjsip show channel <channel>"
```

#### AI Agent Not Responding

1. **Check API keys:**
   ```bash
   curl https://api.anthropic.com/v1/messages \
     -H "x-api-key: $ANTHROPIC_API_KEY" \
     -H "content-type: application/json" \
     -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":10,"messages":[{"role":"user","content":"test"}]}'
   ```

2. **Check TTS service:**
   ```bash
   curl http://localhost:5000/api/tts -X POST \
     -H "Content-Type: application/json" \
     -d '{"text":"Hello","voice":"en_US-lessac-medium"}'
   ```

3. **Check logs:**
   ```bash
   pm2 logs botpbx | grep -i error
   ```

#### Database Connection Failed

1. **Check PostgreSQL is running:**
   ```bash
   systemctl status postgresql
   ```

2. **Test connection:**
   ```bash
   psql -U botpbx -h localhost -d botpbx
   ```

3. **Check pg_hba.conf:**
   ```bash
   cat /etc/postgresql/*/main/pg_hba.conf
   ```

#### Frontend Not Loading

1. **Check service is running:**
   ```bash
   pm2 status botpbx-web
   ```

2. **Check build:**
   ```bash
   cd /opt/botpbx/frontend
   npm run build
   ```

3. **Check logs:**
   ```bash
   pm2 logs botpbx-web
   ```

### Debug Commands

```bash
# System information
uname -a
free -h
df -h
top

# Network
netstat -tlnp
ss -tlnp
ip addr

# Asterisk
asterisk -rx "core show version"
asterisk -rx "core show uptime"
asterisk -rx "core show channels"
asterisk -rx "pjsip show endpoints"

# Database
psql -U botpbx -c "SELECT count(*) FROM extensions"

# Logs
tail -100 /var/log/asterisk/messages
pm2 logs --lines 100
```

### Getting Help

1. **Check documentation**: https://botpbx.com/docs
2. **Search issues**: https://github.com/itwizardo/botpbx/issues
3. **Discord community**: https://discord.gg/botpbx
4. **Email support**: support@botpbx.com

---

## Upgrading

### Upgrade Process

```bash
# Stop services
pm2 stop all

# Backup database
pg_dump -U botpbx botpbx > backup_$(date +%Y%m%d).sql

# Backup configuration
cp /opt/botpbx/.env /opt/botpbx/.env.backup

# Pull latest code
cd /opt/botpbx
git pull origin main

# Install dependencies
npm install
cd frontend && npm install && cd ..

# Run migrations
npm run migrate

# Build frontend
cd frontend && npm run build && cd ..

# Restart services
pm2 restart all
```

### Version-Specific Notes

Check the [CHANGELOG](https://github.com/itwizardo/botpbx/blob/main/CHANGELOG.md) for version-specific upgrade instructions.

---

## FAQ

### General

**Q: Is BotPBX free?**
A: Yes, BotPBX is open source under the MIT license. Self-hosted is completely free. We offer paid managed hosting for those who prefer not to manage their own servers.

**Q: What's the difference between BotPBX and FreePBX?**
A: BotPBX is built from the ground up with AI capabilities, modern web interface, and WebRTC support. FreePBX is a more traditional PBX with a legacy interface.

**Q: Can I use BotPBX without AI features?**
A: Absolutely! BotPBX works as a fully-featured traditional PBX. AI features are optional add-ons.

### Technical

**Q: How many concurrent calls can BotPBX handle?**
A: Depends on your hardware. A 4-core server with 8GB RAM can typically handle 50-100 concurrent calls. AI-powered calls require more resources.

**Q: Which codecs are supported?**
A: Opus (recommended), G.722, G.711 (ulaw/alaw), GSM, and more. Opus provides the best quality at lower bandwidth.

**Q: Can I use my existing SIP phones?**
A: Yes, any standard SIP phone or softphone works with BotPBX.

**Q: How do I migrate from FreePBX?**
A: We provide migration tools to import extensions, trunks, and basic IVRs. Contact support for complex migrations.

### AI Features

**Q: Which AI provider is best?**
A: Depends on your needs:
- **Claude 3.5 Sonnet**: Best overall quality
- **Groq Llama 3.3**: Fastest response time
- **GPT-4o**: Good all-around option

**Q: What's the latency for AI voice agents?**
A: With optimized settings (Groq + Piper TTS + Deepgram), you can achieve sub-500ms response times. With cloud-only providers, expect 800-1200ms.

**Q: Can AI agents transfer to humans?**
A: Yes, AI agents can detect when to transfer and seamlessly hand off to human agents with context.

### Billing & Support

**Q: Do you offer commercial support?**
A: Yes, we offer enterprise support plans with SLAs. Contact sales@botpbx.com.

**Q: How much do AI API calls cost?**
A: You pay the AI providers directly. Rough estimates per minute of conversation:
- Anthropic Claude: ~$0.05
- OpenAI GPT-4o: ~$0.08
- Groq: ~$0.01

---

## Appendix

### Asterisk Dialplan Variables

Common variables available in the dialplan:

| Variable | Description |
|----------|-------------|
| `${CALLERID(num)}` | Caller's phone number |
| `${CALLERID(name)}` | Caller's name |
| `${EXTEN}` | Dialed extension |
| `${CHANNEL}` | Channel name |
| `${UNIQUEID}` | Unique call ID |
| `${EPOCH}` | Current Unix timestamp |
| `${QUEUEPOS}` | Position in queue |
| `${QUEUEHOLDTIME}` | Estimated hold time |

### AGI Variables

Variables passed to AGI scripts:

```
agi_request: script.agi
agi_channel: PJSIP/1001-00000001
agi_language: en
agi_type: PJSIP
agi_uniqueid: 1705123456.789
agi_version: 22.0.0
agi_callerid: 15551234567
agi_calleridname: John Smith
agi_dnid: 1001
agi_context: from-internal
agi_extension: 1001
agi_priority: 1
```

### API Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Invalid or missing token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 422 | Unprocessable - Validation failed |
| 429 | Too Many Requests - Rate limited |
| 500 | Internal Server Error |

### Useful Links

- **GitHub**: https://github.com/itwizardo/botpbx
- **Documentation**: https://botpbx.com/docs
- **API Reference**: https://botpbx.com/docs/api
- **Discord**: https://discord.gg/botpbx
- **Asterisk Docs**: https://docs.asterisk.org
- **PJSIP Guide**: https://docs.asterisk.org/Configuration/Channel-Drivers/SIP/Configuring-res_pjsip

---

*Documentation version: 1.0.0*
*Last updated: January 2025*
*BotPBX - The future of Asterisk. AI voice agents, modern web GUI, visual IVR builder.*
