#!/bin/bash
#
# BotPBX - Fully Automated Installation Script
#
# This script installs EVERYTHING needed to run BotPBX:
# - Node.js 23+
# - PostgreSQL 14+
# - Asterisk 22 (compiled from source with all modules)
# - All configurations auto-generated
# - Services started and verified
#
# Usage: chmod +x install.sh && sudo ./install.sh
#
# NO PROMPTS - Everything is generated automatically
# Install time: ~20-30 minutes (Asterisk compilation takes ~15 mins)
#

set -e

# ============================================
# Configuration
# ============================================
BOTPBX_DIR="/opt/botpbx"
BOTPBX_USER="root"
LOG_FILE="/var/log/botpbx-install.log"
ASTERISK_VERSION="22"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ============================================
# Helper Functions
# ============================================
log() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] WARNING:${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1" >> "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date '+%H:%M:%S')] ERROR:${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >> "$LOG_FILE"
    exit 1
}

generate_password() {
    tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$1"
}

check_port() {
    nc -z localhost "$1" 2>/dev/null
}

wait_for_port() {
    local port=$1
    local timeout=${2:-30}
    local count=0
    while ! check_port "$port" && [ $count -lt $timeout ]; do
        sleep 1
        count=$((count + 1))
    done
    check_port "$port"
}

# ============================================
# Banner
# ============================================
clear
echo -e "${CYAN}"
cat << 'EOF'
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║      ██████╗  ██████╗ ████████╗██████╗ ██████╗ ██╗  ██╗           ║
║      ██╔══██╗██╔═══██╗╚══██╔══╝██╔══██╗██╔══██╗╚██╗██╔╝           ║
║      ██████╔╝██║   ██║   ██║   ██████╔╝██████╔╝ ╚███╔╝            ║
║      ██╔══██╗██║   ██║   ██║   ██╔═══╝ ██╔══██╗ ██╔██╗            ║
║      ██████╔╝╚██████╔╝   ██║   ██║     ██████╔╝██╔╝ ██╗           ║
║      ╚═════╝  ╚═════╝    ╚═╝   ╚═╝     ╚═════╝ ╚═╝  ╚═╝           ║
║                                                                   ║
║              Fully Automated Installation Script                  ║
║                    (Asterisk 22 from source)                      ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# ============================================
# Pre-flight Checks
# ============================================
log "Starting BotPBX installation..."
log "This will take approximately 20-30 minutes"

# Check root
if [ "$EUID" -ne 0 ]; then
    error "This script must be run as root. Use: sudo ./install.sh"
fi

# Check OS
if [ ! -f /etc/os-release ]; then
    error "Cannot detect OS. This script requires Ubuntu/Debian."
fi

source /etc/os-release
if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
    error "This script only supports Ubuntu and Debian. Detected: $ID"
fi

log "Detected OS: $PRETTY_NAME"

# Create log file
mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"

# ============================================
# Step 0: Download BotPBX Source Code
# ============================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "[0/18] Downloading BotPBX source code..."
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# GitHub repository URL
BOTPBX_REPO="https://github.com/itwizardo/botpbx.git"

# Check if source code already exists (running from within the repo)
if [ -f "$BOTPBX_DIR/package.json" ]; then
    log "  ✓ Source code already present at $BOTPBX_DIR"
elif [ -f "$(pwd)/package.json" ] && [ -f "$(pwd)/install.sh" ]; then
    # Running from within the cloned repo directory
    log "  Running from source directory, copying to $BOTPBX_DIR..."
    if [ "$(pwd)" != "$BOTPBX_DIR" ]; then
        # Backup existing directory if present
        if [ -d "$BOTPBX_DIR" ]; then
            warn "Existing installation found at $BOTPBX_DIR"
            warn "Backing up to ${BOTPBX_DIR}.backup"
            mv "$BOTPBX_DIR" "${BOTPBX_DIR}.backup.$(date +%s)"
        fi
        mkdir -p "$BOTPBX_DIR"
        cp -r "$(pwd)"/* "$BOTPBX_DIR/" 2>/dev/null || true
        cp -r "$(pwd)"/.[!.]* "$BOTPBX_DIR/" 2>/dev/null || true
    fi
    log "  ✓ Source code copied to $BOTPBX_DIR"
else
    # Backup existing directory if present
    if [ -d "$BOTPBX_DIR" ]; then
        warn "Existing installation found at $BOTPBX_DIR"
        warn "Backing up to ${BOTPBX_DIR}.backup"
        mv "$BOTPBX_DIR" "${BOTPBX_DIR}.backup.$(date +%s)"
    fi

    # Install git if not present
    if ! command -v git &> /dev/null; then
        log "  Installing git..."
        apt-get update -qq && apt-get install -y -qq git > /dev/null 2>&1
    fi

    log "  Cloning from $BOTPBX_REPO..."
    git clone --depth 1 "$BOTPBX_REPO" "$BOTPBX_DIR" || error "Failed to clone BotPBX repository"

    if [ ! -f "$BOTPBX_DIR/package.json" ]; then
        error "Source code clone failed. package.json not found in $BOTPBX_DIR"
    fi

    log "  ✓ Source code cloned from GitHub"
fi

# ============================================
# Generate All Credentials
# ============================================
log "Generating secure credentials..."

DB_PASSWORD=$(generate_password 24)
JWT_SECRET=$(openssl rand -base64 32)
AMI_SECRET=$(generate_password 20)
ADMIN_PASSWORD="admin"
PUBLIC_IP=$(curl -s --connect-timeout 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

log "  - Database password: generated"
log "  - JWT secret: generated"
log "  - AMI secret: generated"
log "  - Admin password: admin (change on first login)"
log "  - Public IP: $PUBLIC_IP"

# ============================================
# Step 1: Update System & Install Base Packages
# ============================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "[1/15] Installing system packages..."
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y -qq \
    curl \
    wget \
    gnupg \
    ca-certificates \
    lsb-release \
    software-properties-common \
    git \
    ffmpeg \
    netcat-openbsd \
    postgresql \
    postgresql-contrib \
    python3 \
    python3-pip \
    python3-venv \
    ufw \
    > /dev/null 2>&1

log "  ✓ Base packages installed (including Python3 for Piper TTS)"

# ============================================
# Step 2: Install Node.js 23
# ============================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "[2/15] Installing Node.js 23..."
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

NODE_INSTALLED=false
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VERSION" -ge 23 ]; then
        log "  ✓ Node.js $(node -v) already installed"
        NODE_INSTALLED=true
    fi
fi

if [ "$NODE_INSTALLED" = false ]; then
    curl -fsSL https://deb.nodesource.com/setup_23.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null 2>&1
    log "  ✓ Node.js $(node -v) installed"
fi

npm install -g pm2 --silent > /dev/null 2>&1
log "  ✓ PM2 installed"

# ============================================
# Step 3: Install Asterisk 22 Build Dependencies
# ============================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "[3/15] Installing Asterisk build dependencies..."
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

apt-get install -y -qq \
    build-essential \
    libncurses5-dev \
    libssl-dev \
    libxml2-dev \
    libsqlite3-dev \
    uuid-dev \
    libjansson-dev \
    libedit-dev \
    libsrtp2-dev \
    libspandsp-dev \
    libcurl4-openssl-dev \
    libpq-dev \
    libnewt-dev \
    libspeex-dev \
    libspeexdsp-dev \
    libopus-dev \
    libvorbis-dev \
    libogg-dev \
    unixodbc-dev \
    libsndfile1-dev \
    libresample1-dev \
    libasound2-dev \
    portaudio19-dev \
    libradcli-dev \
    freetds-dev \
    libmariadb-dev \
    libpopt-dev \
    liblua5.2-dev \
    libfftw3-dev \
    libgsm1-dev \
    libbluetooth-dev \
    libunbound-dev \
    libcorosync-common-dev \
    autoconf \
    automake \
    libtool \
    pkg-config \
    subversion \
    xmlstarlet \
    > /dev/null 2>&1

log "  ✓ Build dependencies installed"

# ============================================
# Step 4: Download and Compile Asterisk 22
# ============================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "[4/15] Downloading and compiling Asterisk 22..."
log "       (This will take ~10-15 minutes)"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Check if Asterisk 22 is already installed
ASTERISK_INSTALLED=false
if command -v asterisk &> /dev/null; then
    CURRENT_VERSION=$(asterisk -V 2>/dev/null | grep -oP '\d+' | head -1)
    if [ "$CURRENT_VERSION" -ge 22 ]; then
        log "  ✓ Asterisk 22+ already installed: $(asterisk -V)"
        ASTERISK_INSTALLED=true
    fi
fi

if [ "$ASTERISK_INSTALLED" = false ]; then
    cd /usr/src

    # Download Asterisk 22
    log "  Downloading Asterisk 22..."
    if [ ! -f "asterisk-22-current.tar.gz" ]; then
        wget -q https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-22-current.tar.gz
    fi

    # Extract
    rm -rf asterisk-22.*/
    tar xzf asterisk-22-current.tar.gz
    cd asterisk-22.*/

    # Install prerequisites
    log "  Installing Asterisk prerequisites..."
    yes | contrib/scripts/install_prereq install >> "$LOG_FILE" 2>&1 || true

    # Download MP3 source for format_mp3 support
    log "  Downloading MP3 decoder library..."
    contrib/scripts/get_mp3_source.sh >> "$LOG_FILE" 2>&1 || warn "MP3 source download failed (non-fatal)"

    # Configure with bundled pjproject
    log "  Configuring Asterisk..."
    if ! ./configure --with-pjproject-bundled --with-jansson-bundled >> "$LOG_FILE" 2>&1; then
        error "Asterisk ./configure failed. Check $LOG_FILE for details."
    fi

    # Create menuselect options
    log "  Selecting modules..."
    if ! make menuselect.makeopts >> "$LOG_FILE" 2>&1; then
        error "Asterisk menuselect failed. Check $LOG_FILE for details."
    fi

    # Enable required modules
    menuselect/menuselect \
        --enable app_audiosocket \
        --enable chan_audiosocket \
        --enable res_audiosocket \
        --enable res_pjsip \
        --enable res_pjsip_transport_websocket \
        --enable res_pjsip_nat \
        --enable res_pjsip_sdp_rtp \
        --enable res_pjsip_session \
        --enable res_pjsip_endpoint_identifier_ip \
        --enable res_pjsip_endpoint_identifier_user \
        --enable res_stir_shaken \
        --enable app_amd \
        --enable codec_opus \
        --enable codec_speex \
        --enable codec_gsm \
        --enable codec_ulaw \
        --enable codec_alaw \
        --enable codec_g722 \
        --enable res_speech \
        --enable res_agi \
        --enable app_mixmonitor \
        --enable app_chanspy \
        --enable app_voicemail \
        --enable app_queue \
        --enable app_dial \
        --enable app_playback \
        --enable app_record \
        --enable app_echo \
        --enable res_musiconhold \
        --enable res_http_websocket \
        --enable res_rtp_asterisk \
        --enable res_srtp \
        --enable format_wav \
        --enable format_wav_gsm \
        --enable format_gsm \
        --enable format_pcm \
        --enable format_sln \
        --enable format_mp3 \
        --enable pbx_config \
        --enable func_callerid \
        --enable func_channel \
        --enable func_global \
        --enable CORE-SOUNDS-EN-WAV \
        --enable CORE-SOUNDS-EN-ULAW \
        --enable MOH-OPSOUND-WAV \
        --enable EXTRA-SOUNDS-EN-WAV \
        menuselect.makeopts > /dev/null 2>&1

    # Compile
    log "  Compiling Asterisk (using $(nproc) cores)..."
    if ! make -j$(nproc) >> "$LOG_FILE" 2>&1; then
        error "Asterisk compilation failed. Check $LOG_FILE for details."
    fi

    # Install
    log "  Installing Asterisk..."
    if ! make install >> "$LOG_FILE" 2>&1; then
        error "Asterisk 'make install' failed. Check $LOG_FILE for details."
    fi

    log "  Installing Asterisk samples..."
    make samples >> "$LOG_FILE" 2>&1 || warn "make samples had warnings (non-fatal)"

    log "  Installing Asterisk init scripts..."
    make config >> "$LOG_FILE" 2>&1 || warn "make config had warnings (non-fatal)"

    make install-logrotate >> "$LOG_FILE" 2>&1 || true
    ldconfig

    log "  ✓ Asterisk 22 compiled and installed"
fi

# ============================================
# Step 5: Create Asterisk User and Directories
# ============================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "[5/15] Setting up Asterisk user and directories..."
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Create asterisk user if not exists
id -u asterisk &>/dev/null || useradd -m -d /var/lib/asterisk -s /bin/false asterisk

# Create directories
mkdir -p /var/lib/asterisk/sounds/botpbx
mkdir -p /var/lib/asterisk/moh/botpbx
mkdir -p /var/spool/asterisk/monitor
mkdir -p /var/spool/asterisk/voicemail
mkdir -p /var/log/asterisk
mkdir -p /var/run/asterisk

# Set permissions
chown -R asterisk:asterisk /var/lib/asterisk
chown -R asterisk:asterisk /var/spool/asterisk
chown -R asterisk:asterisk /var/log/asterisk
chown -R asterisk:asterisk /var/run/asterisk
chown -R asterisk:asterisk /etc/asterisk

log "  ✓ Asterisk user and directories configured"

# ============================================
# Step 6: Configure PostgreSQL
# ============================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "[6/15] Configuring PostgreSQL..."
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

systemctl start postgresql
systemctl enable postgresql > /dev/null 2>&1

sudo -u postgres psql -c "DROP DATABASE IF EXISTS botpbx;" > /dev/null 2>&1 || true
sudo -u postgres psql -c "DROP USER IF EXISTS botpbx;" > /dev/null 2>&1 || true
sudo -u postgres psql -c "CREATE USER botpbx WITH PASSWORD '$DB_PASSWORD';" > /dev/null 2>&1
sudo -u postgres psql -c "CREATE DATABASE botpbx OWNER botpbx;" > /dev/null 2>&1
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE botpbx TO botpbx;" > /dev/null 2>&1

log "  ✓ PostgreSQL database 'botpbx' created"
log "  ✓ PostgreSQL user 'botpbx' created"

# ============================================
# Step 7: Configure Asterisk
# ============================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "[7/15] Configuring Asterisk..."
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Configure AMI (manager.conf)
cat > /etc/asterisk/manager.conf << EOF
; Asterisk Manager Interface Configuration
; Auto-generated by BotPBX installer

[general]
enabled = yes
port = 5038
bindaddr = 127.0.0.1

[botpbx]
secret = $AMI_SECRET
deny = 0.0.0.0/0.0.0.0
permit = 127.0.0.1/255.255.255.255
read = system,call,log,verbose,agent,user,config,dtmf,reporting,cdr,dialplan,originate
write = system,call,agent,user,config,command,reporting,originate
eventfilter = !Event: RTCPSent
eventfilter = !Event: RTCPReceived
EOF

log "  ✓ AMI configured (manager.conf)"

# Configure HTTP for WebSocket (http.conf)
cat > /etc/asterisk/http.conf << EOF
; HTTP/WebSocket Configuration
; Auto-generated by BotPBX installer

[general]
enabled = yes
bindaddr = 0.0.0.0
bindport = 8088
tlsenable = no
EOF

log "  ✓ HTTP/WebSocket configured (http.conf)"

# Configure modules.conf
cat > /etc/asterisk/modules.conf << EOF
; Asterisk Module Configuration
; Auto-generated by BotPBX installer

[modules]
autoload = yes

; Explicitly load critical modules
load = res_pjsip.so
load = res_pjsip_transport_websocket.so
load = res_pjsip_session.so
load = res_pjsip_sdp_rtp.so
load = res_pjsip_nat.so
load = res_pjsip_endpoint_identifier_user.so
load = res_pjsip_endpoint_identifier_ip.so

; AudioSocket for AI agents
load = res_audiosocket.so
load = app_audiosocket.so
load = chan_audiosocket.so

; STIR/SHAKEN (Asterisk 22+)
load = res_stir_shaken.so

; Call features
load = app_amd.so
load = app_mixmonitor.so
load = app_chanspy.so
load = app_queue.so
load = app_voicemail.so
load = res_musiconhold.so

; AGI and dialplan
load = res_agi.so
load = pbx_config.so

; Codecs
load = codec_opus.so
load = codec_ulaw.so
load = codec_alaw.so
load = codec_gsm.so
load = codec_g722.so

; Disable old SIP (using PJSIP instead)
noload = chan_sip.so
noload = res_config_sqlite.so
noload = res_config_sqlite3.so
EOF

log "  ✓ Modules configured (modules.conf)"

# Create empty include files for BotPBX
touch /etc/asterisk/pjsip_extensions.conf
touch /etc/asterisk/pjsip_trunks.conf
chown asterisk:asterisk /etc/asterisk/pjsip_extensions.conf
chown asterisk:asterisk /etc/asterisk/pjsip_trunks.conf

# Update pjsip.conf to include BotPBX configs
if [ -f /etc/asterisk/pjsip.conf ]; then
    if ! grep -q "pjsip_extensions.conf" /etc/asterisk/pjsip.conf 2>/dev/null; then
        echo "" >> /etc/asterisk/pjsip.conf
        echo "; BotPBX includes" >> /etc/asterisk/pjsip.conf
        echo "#include pjsip_extensions.conf" >> /etc/asterisk/pjsip.conf
        echo "#include pjsip_trunks.conf" >> /etc/asterisk/pjsip.conf
    fi
else
    cat > /etc/asterisk/pjsip.conf << EOF
; PJSIP Configuration
; Auto-generated by BotPBX installer

[global]
type = global
max_initial_qualify_time = 0
keep_alive_interval = 90

[transport-udp]
type = transport
protocol = udp
bind = 0.0.0.0:5060
external_media_address = ${PUBLIC_IP}
external_signaling_address = ${PUBLIC_IP}
local_net = 127.0.0.1/32
local_net = 10.0.0.0/8
local_net = 172.16.0.0/12
local_net = 192.168.0.0/16

[transport-tcp]
type = transport
protocol = tcp
bind = 0.0.0.0:5060
external_media_address = ${PUBLIC_IP}
external_signaling_address = ${PUBLIC_IP}
local_net = 127.0.0.1/32
local_net = 10.0.0.0/8
local_net = 172.16.0.0/12
local_net = 192.168.0.0/16

[transport-wss]
type = transport
protocol = wss
bind = 0.0.0.0:8089
external_media_address = ${PUBLIC_IP}
external_signaling_address = ${PUBLIC_IP}
local_net = 127.0.0.1/32
local_net = 10.0.0.0/8
local_net = 172.16.0.0/12
local_net = 192.168.0.0/16

; BotPBX includes
#include pjsip_extensions.conf
#include pjsip_trunks.conf
EOF
fi

log "  ✓ PJSIP configured"

# Create RTP configuration
cat > /etc/asterisk/rtp.conf << 'EOF'
; RTP Configuration
; Auto-generated by BotPBX installer

[general]
rtpstart = 10000
rtpend = 20000
strictrtp = yes
icesupport = yes
stunaddr = stun.l.google.com:19302
rtpkeepalive = 30
rtptimeout = 60
rtpholdtimeout = 300
EOF
chown asterisk:asterisk /etc/asterisk/rtp.conf

log "  ✓ RTP configured (ports 10000-20000)"

# Create base extensions.conf with BotPBX contexts
cat > /etc/asterisk/extensions.conf << 'EOF'
; Asterisk Dialplan Configuration
; Auto-generated by BotPBX installer
; Note: BotPBX dynamically updates this file via the API

[general]
static = yes
writeprotect = no
clearglobalvars = no

[globals]
; Global variables set by BotPBX

; ============================================
; INTERNAL CALLS (Extension to Extension)
; ============================================
[internal]
; Internal extension dialing handled by BotPBX

; ============================================
; INBOUND CALLS FROM TRUNKS
; ============================================
[from-trunk]
exten => _X.,1,NoOp(Inbound call to ${EXTEN} from trunk)
 same => n,Set(CDR(accountcode)=inbound)
 same => n,Goto(botpbx-ivr,${EXTEN},1)

; ============================================
; OUTBOUND CALLS
; ============================================
[outbound]
; Outbound routing handled by BotPBX

; ============================================
; BOTPBX IVR CONTEXT
; ============================================
[botpbx-ivr]
exten => _X.,1,NoOp(BotPBX IVR handling ${EXTEN})
 same => n,Answer()
 same => n,Wait(0.5)
 same => n,AGI(agi://127.0.0.1:4573)
 same => n,Hangup()

exten => i,1,NoOp(Invalid entry)
 same => n,Playback(invalid)
 same => n,Goto(botpbx-ivr,s,1)

exten => t,1,NoOp(Timeout)
 same => n,Hangup()

exten => h,1,NoOp(Hangup handler)

; ============================================
; AI AGENT CONTEXT
; ============================================
[botpbx-ai]
exten => _X.,1,NoOp(AI Agent call to ${EXTEN})
 same => n,Answer()
 same => n,Wait(0.5)
 same => n,Set(CHANNEL(audioreadformat)=slin)
 same => n,Set(CHANNEL(audiowriteformat)=slin)
 same => n,AudioSocket(${AI_SOCKET_ID},127.0.0.1:9092)
 same => n,Hangup()

; ============================================
; CAMPAIGN DIALER CONTEXT
; ============================================
[botpbx-campaign]
exten => _X.,1,NoOp(Campaign call to ${EXTEN})
 same => n,Set(CDR(accountcode)=campaign-${CAMPAIGN_ID})
 same => n,Dial(PJSIP/${EXTEN}@${TRUNK},60,g)
 same => n,GotoIf($["${DIALSTATUS}" = "ANSWER"]?answered:noanswer)
 same => n(answered),NoOp(Call answered)
 same => n,AGI(agi://127.0.0.1:4573)
 same => n,Hangup()
 same => n(noanswer),NoOp(Call not answered: ${DIALSTATUS})
 same => n,Hangup()

; ============================================
; VOICEMAIL
; ============================================
[voicemail]
exten => _X.,1,NoOp(Voicemail for ${EXTEN})
 same => n,Answer()
 same => n,Wait(0.5)
 same => n,VoiceMail(${EXTEN}@default,u)
 same => n,Hangup()

; ============================================
; WEBRTC CALLS
; ============================================
[webrtc]
exten => _X.,1,NoOp(WebRTC call to ${EXTEN})
 same => n,Dial(PJSIP/${EXTEN},30)
 same => n,Hangup()

; ============================================
; TESTING
; ============================================
[test]
exten => echo,1,Answer()
 same => n,Echo()
 same => n,Hangup()

exten => playback,1,Answer()
 same => n,Playback(hello-world)
 same => n,Hangup()
EOF
chown asterisk:asterisk /etc/asterisk/extensions.conf

log "  ✓ Extensions dialplan configured"

# Configure asterisk.conf to run as asterisk user
sed -i 's/^;runuser = asterisk/runuser = asterisk/' /etc/asterisk/asterisk.conf 2>/dev/null || true
sed -i 's/^;rungroup = asterisk/rungroup = asterisk/' /etc/asterisk/asterisk.conf 2>/dev/null || true

# Start Asterisk
systemctl restart asterisk 2>/dev/null || asterisk -g
systemctl enable asterisk > /dev/null 2>&1 || true

log "  ✓ Asterisk started"

# ============================================
# Step 8: Create BotPBX Environment
# ============================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "[8/15] Creating BotPBX environment..."
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

mkdir -p "$BOTPBX_DIR/data/audio"
mkdir -p "$BOTPBX_DIR/data/recordings"
mkdir -p "$BOTPBX_DIR/logs"

# Create backend .env
cat > "$BOTPBX_DIR/.env" << EOF
# BotPBX Configuration
# Auto-generated by installer on $(date)

# Database
DATABASE_URL=postgresql://botpbx:${DB_PASSWORD}@localhost:5432/botpbx

# Security
JWT_SECRET=${JWT_SECRET}

# Asterisk AMI
ASTERISK_AMI_HOST=127.0.0.1
ASTERISK_AMI_PORT=5038
ASTERISK_AMI_USER=botpbx
ASTERISK_AMI_SECRET=${AMI_SECRET}

# Server Ports
API_PORT=3000
WEB_API_PORT=3000
WEB_API_HOST=0.0.0.0
AGI_SERVER_PORT=4573
AUDIOSOCKET_PORT=9092
AUDIO_SOCKET_PORT=9092
BROWSER_AUDIO_PORT=9093

# Storage Paths
DATABASE_PATH=./data/database.sqlite
AUDIO_FILES_PATH=./data/audio
ASTERISK_CONFIG_PATH=/etc/asterisk
RECORDING_PATH=/var/spool/asterisk/monitor

# Piper TTS (local)
PIPER_ENABLED=true
PIPER_URL=http://127.0.0.1:5050

# Logging
LOG_LEVEL=info

# Admin credentials (for reference)
# Username: admin
# Password: ${ADMIN_PASSWORD}
EOF

log "  ✓ Backend .env created"

# Create frontend .env
cat > "$BOTPBX_DIR/web-admin/.env" << EOF
# BotPBX Web Admin
# Auto-generated by installer

NEXT_PUBLIC_API_URL=http://${PUBLIC_IP}:3000
NEXT_PUBLIC_WS_URL=ws://${PUBLIC_IP}:3000
EOF

cat > "$BOTPBX_DIR/web-admin/.env.local" << EOF
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3000
EOF

log "  ✓ Frontend .env created"

# ============================================
# Step 9: Install NPM Dependencies
# ============================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "[9/15] Installing NPM dependencies..."
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

cd "$BOTPBX_DIR"

log "  Installing backend dependencies..."
npm install --silent 2>/dev/null
log "  ✓ Backend dependencies installed"

log "  Installing frontend dependencies..."
cd "$BOTPBX_DIR/web-admin"
npm install --silent 2>/dev/null
log "  ✓ Frontend dependencies installed"

cd "$BOTPBX_DIR"

# ============================================
# Step 10: Build Projects
# ============================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "[10/15] Building projects..."
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

log "  Building backend..."
npm run build 2>/dev/null
log "  ✓ Backend built"

log "  Building frontend..."
cd "$BOTPBX_DIR/web-admin"
npm run build 2>/dev/null
log "  ✓ Frontend built"

cd "$BOTPBX_DIR"

# ============================================
# Step 11: Configure Firewall
# ============================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "[11/15] Configuring firewall..."
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Enable UFW if not already enabled
ufw --force enable > /dev/null 2>&1 || true

# SSH (don't lock ourselves out!)
ufw allow 22/tcp comment 'SSH' > /dev/null 2>&1

# BotPBX Web Services
ufw allow 3000/tcp comment 'BotPBX API' > /dev/null 2>&1
ufw allow 3001/tcp comment 'BotPBX Web UI' > /dev/null 2>&1

# Asterisk SIP/PJSIP
ufw allow 5060/udp comment 'SIP UDP' > /dev/null 2>&1
ufw allow 5060/tcp comment 'SIP TCP' > /dev/null 2>&1

# WebRTC WSS
ufw allow 8088/tcp comment 'Asterisk HTTP' > /dev/null 2>&1
ufw allow 8089/tcp comment 'WebRTC WSS' > /dev/null 2>&1

# BotPBX Services
ufw allow 4573/tcp comment 'AGI Server' > /dev/null 2>&1
ufw allow 9092/tcp comment 'AudioSocket AI' > /dev/null 2>&1
ufw allow 9093/tcp comment 'Browser Audio' > /dev/null 2>&1
ufw allow 5050/tcp comment 'Piper TTS' > /dev/null 2>&1
ufw allow 5003/tcp comment 'Kokoro TTS' > /dev/null 2>&1

# RTP Media Ports
ufw allow 10000:20000/udp comment 'RTP Media' > /dev/null 2>&1

log "  ✓ Firewall configured with all required ports"

# Create logrotate configuration
cat > /etc/logrotate.d/botpbx << 'EOF'
/opt/botpbx/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    missingok
    copytruncate
}

/var/log/asterisk/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    missingok
    postrotate
        /usr/sbin/asterisk -rx 'logger reload' > /dev/null 2>&1 || true
    endscript
}
EOF

log "  ✓ Logrotate configured for BotPBX and Asterisk logs"

# ============================================
# Step 12: Install Piper TTS
# ============================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "[12/18] Installing Piper TTS..."
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

PIPER_DIR="/opt/piper"
mkdir -p "$PIPER_DIR"

if [ ! -f "$PIPER_DIR/piper" ]; then
    log "  Downloading Piper TTS..."
    cd /tmp
    wget -q https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz
    tar xzf piper_linux_x86_64.tar.gz
    mv piper/* "$PIPER_DIR/"
    rm -rf piper piper_linux_x86_64.tar.gz
    log "  ✓ Piper TTS downloaded"
else
    log "  ✓ Piper TTS already installed"
fi

# Download default voice
mkdir -p "$PIPER_DIR/voices"
if [ ! -f "$PIPER_DIR/voices/en_US-lessac-medium.onnx" ]; then
    log "  Downloading Piper voice..."
    cd "$PIPER_DIR/voices"
    wget -q https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
    wget -q https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
    log "  ✓ Piper voice downloaded"
else
    log "  ✓ Piper voice already present"
fi

# Create Piper HTTP server
cat > "$PIPER_DIR/piper-server.py" << 'PIPEREOF'
#!/usr/bin/env python3
"""Simple HTTP server wrapper for Piper TTS"""
import http.server
import json
import subprocess
import tempfile
import os
import glob
from urllib.parse import parse_qs

PORT = 5050
VOICES_DIR = "/opt/piper/voices"
PIPER_BIN = "/opt/piper/piper"
PIPER_LIB_PATH = "/opt/piper"

os.environ["LD_LIBRARY_PATH"] = PIPER_LIB_PATH + ":" + os.environ.get("LD_LIBRARY_PATH", "")

def get_available_voices():
    voices = []
    for onnx_file in glob.glob(f"{VOICES_DIR}/*.onnx"):
        name = os.path.basename(onnx_file).replace(".onnx", "")
        parts = name.split("-")
        lang = parts[0] if len(parts) > 0 else "en"
        country = parts[1] if len(parts) > 1 else "US"
        voice_name = parts[2] if len(parts) > 2 else "default"
        quality = parts[3] if len(parts) > 3 else "medium"
        voices.append({
            "id": name,
            "name": f"{voice_name.title()} ({lang}_{country})",
            "language": f"{lang}-{country}",
            "gender": "neutral",
            "quality": quality,
            "path": onnx_file
        })
    return voices

VOICES = get_available_voices()

class PiperHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass
    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    def send_audio(self, audio_data):
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(audio_data)
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
    def do_GET(self):
        if self.path == "/health":
            self.send_json({"status": "ok", "engine": "piper", "voices": len(VOICES)})
        elif self.path == "/voices":
            self.send_json({"voices": VOICES})
        else:
            self.send_response(404)
            self.end_headers()
    def do_POST(self):
        if self.path != "/synthesize":
            self.send_response(404)
            self.end_headers()
            return
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode()
            data = json.loads(body)
            text = data.get("text", "")
            voice_id = data.get("voice", "en_US-lessac-medium")
            output_path = data.get("output_path")
            if not text:
                self.send_json({"error": "No text provided"}, 400)
                return
            voice_file = f"{VOICES_DIR}/{voice_id}.onnx"
            if not os.path.exists(voice_file):
                voice_file = glob.glob(f"{VOICES_DIR}/*.onnx")[0] if VOICES else None
            if not voice_file:
                self.send_json({"error": "No voices available"}, 500)
                return
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                temp_out = f.name
            cmd = [PIPER_BIN, "--model", voice_file, "--output_file", temp_out]
            proc = subprocess.run(cmd, input=text.encode(), capture_output=True, timeout=60,
                                  env={**os.environ, "LD_LIBRARY_PATH": PIPER_LIB_PATH})
            if proc.returncode != 0:
                os.unlink(temp_out)
                self.send_json({"error": f"Piper failed: {proc.stderr.decode()}"}, 500)
                return
            if output_path:
                os.rename(temp_out, output_path)
                self.send_json({"success": True, "output_path": output_path})
            else:
                with open(temp_out, "rb") as f:
                    audio_data = f.read()
                os.unlink(temp_out)
                self.send_audio(audio_data)
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

if __name__ == "__main__":
    print(f"Piper TTS server starting on port {PORT}...")
    server = http.server.HTTPServer(("127.0.0.1", PORT), PiperHandler)
    server.serve_forever()
PIPEREOF

chmod +x "$PIPER_DIR/piper-server.py"
log "  ✓ Piper TTS server configured"

# ============================================
# Step 13: Install Kokoro TTS
# ============================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "[13/18] Installing Kokoro TTS..."
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Create Python virtual environment for Kokoro
KOKORO_VENV="$BOTPBX_DIR/kokoro-venv"
KOKORO_SKIP=false
if [ ! -f "$KOKORO_VENV/bin/pip" ]; then
    log "  Creating Kokoro virtual environment..."
    rm -rf "$KOKORO_VENV" 2>/dev/null || true
    if python3 -m venv "$KOKORO_VENV" 2>> "$LOG_FILE"; then
        log "  ✓ Virtual environment created"
    else
        warn "Failed to create Python venv. Skipping Kokoro TTS."
        warn "Install python3-venv and re-run: apt install python3-venv"
        KOKORO_SKIP=true
    fi
fi

if [ "$KOKORO_SKIP" = true ]; then
    log "  Skipping Kokoro TTS installation"
else

# Install Kokoro dependencies
log "  Installing Kokoro dependencies (this may take a few minutes)..."
"$KOKORO_VENV/bin/pip" install --upgrade pip >> "$LOG_FILE" 2>&1
log "  Installing kokoro-onnx, soundfile, numpy..."
"$KOKORO_VENV/bin/pip" install kokoro-onnx soundfile numpy >> "$LOG_FILE" 2>&1 || {
    warn "Kokoro dependencies failed to install. Kokoro TTS will be unavailable."
    warn "You can try manually: $KOKORO_VENV/bin/pip install kokoro-onnx soundfile numpy"
}
log "  ✓ Kokoro dependencies installed"

# Download Kokoro model files
SCRIPTS_DIR="$BOTPBX_DIR/scripts"
mkdir -p "$SCRIPTS_DIR"
cd "$SCRIPTS_DIR"

if [ ! -f "$SCRIPTS_DIR/kokoro-v1.0.onnx" ]; then
    log "  Downloading Kokoro model (310MB)..."
    wget -q https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
    log "  ✓ Kokoro model downloaded"
else
    log "  ✓ Kokoro model already present"
fi

if [ ! -f "$SCRIPTS_DIR/voices-v1.0.bin" ]; then
    log "  Downloading Kokoro voices..."
    wget -q https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
    log "  ✓ Kokoro voices downloaded"
else
    log "  ✓ Kokoro voices already present"
fi

# Create Kokoro TTS server if not exists
if [ ! -f "$SCRIPTS_DIR/kokoro-tts-server.py" ]; then
    cat > "$SCRIPTS_DIR/kokoro-tts-server.py" << 'KOKOROEOF'
#!/usr/bin/env python3
"""Kokoro TTS Server for BotPBX"""
import os, sys, json, tempfile, logging
from http.server import HTTPServer, BaseHTTPRequestHandler
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)
kokoro_pipeline = None

def get_kokoro():
    global kokoro_pipeline
    if kokoro_pipeline is None:
        logger.info("Loading Kokoro TTS model...")
        from kokoro_onnx import Kokoro
        script_dir = os.path.dirname(os.path.abspath(__file__))
        kokoro_pipeline = Kokoro(
            os.path.join(script_dir, "kokoro-v1.0.onnx"),
            os.path.join(script_dir, "voices-v1.0.bin")
        )
        logger.info("Kokoro TTS model loaded")
    return kokoro_pipeline

class TTSHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): logger.info(f"{self.address_string()} - {format % args}")
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "engine": "kokoro"}).encode())
        else:
            self.send_response(404)
            self.end_headers()
    def do_POST(self):
        if self.path != '/synthesize':
            self.send_response(404)
            self.end_headers()
            return
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            text, voice = data.get('text', ''), data.get('voice', 'af_heart')
            output_path = data.get('output_path')
            if not text:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "No text"}).encode())
                return
            kokoro = get_kokoro()
            samples, sample_rate = kokoro.create(text, voice=voice, speed=1.0)
            import soundfile as sf
            if output_path:
                sf.write(output_path, samples, sample_rate)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "output_path": output_path}).encode())
            else:
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                    sf.write(f.name, samples, sample_rate)
                    audio_data = open(f.name, 'rb').read()
                    os.unlink(f.name)
                self.send_response(200)
                self.send_header('Content-Type', 'audio/wav')
                self.end_headers()
                self.wfile.write(audio_data)
        except Exception as e:
            logger.error(f"TTS error: {e}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

if __name__ == '__main__':
    port = int(os.environ.get('KOKORO_PORT', 5003))
    logger.info(f"Kokoro TTS server starting on port {port}")
    HTTPServer(('127.0.0.1', port), TTSHandler).serve_forever()
KOKOROEOF
    fi

    chmod +x "$SCRIPTS_DIR/kokoro-tts-server.py"
    log "  ✓ Kokoro TTS configured"
fi  # End KOKORO_SKIP check

# ============================================
# Step 14: Setup PM2 Services
# ============================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "[14/18] Setting up PM2 services..."
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

pm2 delete botpbx 2>/dev/null || true
pm2 delete botpbx-web 2>/dev/null || true
pm2 delete piper-tts 2>/dev/null || true
pm2 delete kokoro-tts 2>/dev/null || true

# Start Piper TTS
cd "$PIPER_DIR"
pm2 start piper-server.py --name piper-tts --interpreter python3
log "  ✓ Piper TTS service started"

# Start Kokoro TTS (if installed)
if [ -f "$KOKORO_VENV/bin/python" ] && [ -f "$SCRIPTS_DIR/kokoro-tts-server.py" ]; then
    cd "$SCRIPTS_DIR"
    pm2 start kokoro-tts-server.py --name kokoro-tts --interpreter "$KOKORO_VENV/bin/python"
    log "  ✓ Kokoro TTS service started"
else
    log "  Skipping Kokoro TTS service (not installed)"
fi

# Start BotPBX backend
cd "$BOTPBX_DIR"
pm2 start npm --name botpbx -- start
log "  ✓ Backend service started"

# Start BotPBX web admin
cd "$BOTPBX_DIR/web-admin"
pm2 start npm --name botpbx-web -- start
log "  ✓ Frontend service started"

pm2 save > /dev/null 2>&1
pm2 startup systemd -u root --hp /root > /dev/null 2>&1 || true

cd "$BOTPBX_DIR"

# ============================================
# Setup Auto-Update Cron Job
# ============================================
log "  Setting up auto-update..."

# Make update scripts executable
chmod +x "$BOTPBX_DIR/scripts/update-check.sh" 2>/dev/null || true
chmod +x "$BOTPBX_DIR/scripts/botpbx-update.sh" 2>/dev/null || true

# Create cron job for hourly update checks
cat > /etc/cron.d/botpbx-update << 'CRON'
# BotPBX Auto-Update - Checks for new releases every hour
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
0 * * * * root /opt/botpbx/scripts/update-check.sh >> /var/log/botpbx-update.log 2>&1
CRON
chmod 644 /etc/cron.d/botpbx-update

# Create log file with proper permissions
touch /var/log/botpbx-update.log
chmod 644 /var/log/botpbx-update.log

log "  ✓ Auto-update configured (checks hourly)"

# ============================================
# Step 15: Wait for Services & Reload Asterisk
# ============================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "[15/18] Waiting for services and reloading Asterisk..."
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

log "  Waiting for backend API (port 3000)..."
if wait_for_port 3000 60; then
    log "  ✓ Backend API is running"
else
    warn "  Backend API not responding on port 3000"
fi

log "  Waiting for frontend (port 3001)..."
if wait_for_port 3001 60; then
    log "  ✓ Frontend is running"
else
    warn "  Frontend not responding on port 3001"
fi

# Reload Asterisk configs
sleep 3
asterisk -rx "core reload" > /dev/null 2>&1 || true
asterisk -rx "pjsip reload" > /dev/null 2>&1 || true
asterisk -rx "dialplan reload" > /dev/null 2>&1 || true
asterisk -rx "manager reload" > /dev/null 2>&1 || true

log "  ✓ Asterisk configuration reloaded"

# ============================================
# Step 16: Create Default Admin User
# ============================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "[16/18] Creating default admin user..."
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

sleep 5

ADMIN_RESPONSE=$(curl -s -X POST "http://localhost:3000/api/v1/auth/register" \
    -H "Content-Type: application/json" \
    -d "{
        \"username\": \"admin\",
        \"password\": \"$ADMIN_PASSWORD\",
        \"email\": \"admin@botpbx.local\",
        \"role\": \"admin\"
    }" 2>/dev/null || echo '{"error":"failed"}')

if echo "$ADMIN_RESPONSE" | grep -q "error"; then
    warn "  Could not create admin user (may already exist)"
else
    log "  ✓ Admin user created"
fi

# ============================================
# Step 17: Verify All Services
# ============================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "[17/18] Verifying all services..."
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo ""

# Check PostgreSQL
if systemctl is-active --quiet postgresql; then
    echo -e "  ${GREEN}✓${NC} PostgreSQL running"
else
    echo -e "  ${RED}✗${NC} PostgreSQL not running"
fi

# Check Asterisk
if pgrep -x asterisk > /dev/null || systemctl is-active --quiet asterisk; then
    ASTERISK_VER=$(asterisk -V 2>/dev/null || echo "Unknown")
    echo -e "  ${GREEN}✓${NC} Asterisk running ($ASTERISK_VER)"
else
    echo -e "  ${RED}✗${NC} Asterisk not running"
fi

# Check AMI (port 5038)
if check_port 5038; then
    echo -e "  ${GREEN}✓${NC} Asterisk AMI on :5038"
else
    echo -e "  ${RED}✗${NC} Asterisk AMI not responding on :5038"
fi

# Check Backend API (port 3000)
if check_port 3000; then
    echo -e "  ${GREEN}✓${NC} Backend API on :3000"
else
    echo -e "  ${RED}✗${NC} Backend API not responding on :3000"
fi

# Check Frontend (port 3001)
if check_port 3001; then
    echo -e "  ${GREEN}✓${NC} Frontend on :3001"
else
    echo -e "  ${RED}✗${NC} Frontend not responding on :3001"
fi

# Check AGI Server (port 4573)
if check_port 4573; then
    echo -e "  ${GREEN}✓${NC} AGI Server on :4573"
else
    echo -e "  ${YELLOW}!${NC} AGI Server on :4573 (starts on first call)"
fi

# Check AudioSocket (port 9092)
if check_port 9092; then
    echo -e "  ${GREEN}✓${NC} AudioSocket on :9092"
else
    echo -e "  ${YELLOW}!${NC} AudioSocket on :9092 (requires OpenAI key)"
fi

# Check Browser Audio (port 9093)
if check_port 9093; then
    echo -e "  ${GREEN}✓${NC} Browser Audio on :9093"
else
    echo -e "  ${YELLOW}!${NC} Browser Audio on :9093"
fi

# Check WebRTC WSS (port 8089)
if check_port 8089; then
    echo -e "  ${GREEN}✓${NC} WebRTC WSS on :8089"
else
    echo -e "  ${YELLOW}!${NC} WebRTC WSS on :8089"
fi

# Check Piper TTS (port 5050)
PIPER_OK=false
for i in {1..10}; do
    if curl -s http://127.0.0.1:5050/health > /dev/null 2>&1; then
        PIPER_OK=true
        break
    fi
    sleep 1
done

if [ "$PIPER_OK" = true ]; then
    echo -e "  ${GREEN}✓${NC} Piper TTS on :5050"
else
    echo -e "  ${YELLOW}!${NC} Piper TTS on :5050 (starting...)"
fi

# Check Kokoro TTS (port 5003)
KOKORO_OK=false
for i in {1..10}; do
    if curl -s http://127.0.0.1:5003/health > /dev/null 2>&1; then
        KOKORO_OK=true
        break
    fi
    sleep 1
done

if [ "$KOKORO_OK" = true ]; then
    echo -e "  ${GREEN}✓${NC} Kokoro TTS on :5003"
else
    echo -e "  ${YELLOW}!${NC} Kokoro TTS on :5003 (model loads on first request)"
fi

# Check firewall status
UFW_ACTIVE=$(ufw status 2>/dev/null | grep -c "Status: active" || echo "0")
if [ "$UFW_ACTIVE" -gt 0 ]; then
    echo -e "  ${GREEN}✓${NC} Firewall configured and active"
else
    echo -e "  ${YELLOW}!${NC} Firewall not active"
fi

# Check Asterisk modules
echo ""
log "Verifying Asterisk modules..."
AUDIOSOCKET_LOADED=$(asterisk -rx "module show like audiosocket" 2>/dev/null | grep -c "audiosocket" || echo "0")
PJSIP_LOADED=$(asterisk -rx "module show like pjsip" 2>/dev/null | grep -c "res_pjsip" || echo "0")
STIR_LOADED=$(asterisk -rx "module show like stir_shaken" 2>/dev/null | grep -c "stir_shaken" || echo "0")

if [ "$AUDIOSOCKET_LOADED" -gt 0 ]; then
    echo -e "  ${GREEN}✓${NC} AudioSocket modules loaded"
else
    echo -e "  ${YELLOW}!${NC} AudioSocket modules not loaded"
fi

if [ "$PJSIP_LOADED" -gt 0 ]; then
    echo -e "  ${GREEN}✓${NC} PJSIP modules loaded ($PJSIP_LOADED modules)"
else
    echo -e "  ${RED}✗${NC} PJSIP modules not loaded"
fi

if [ "$STIR_LOADED" -gt 0 ]; then
    echo -e "  ${GREEN}✓${NC} STIR/SHAKEN module loaded"
else
    echo -e "  ${YELLOW}!${NC} STIR/SHAKEN module not loaded (optional)"
fi

# Verify dialplan contexts
echo ""
log "Verifying dialplan contexts..."
CONTEXTS_FOUND=$(asterisk -rx "dialplan show" 2>/dev/null | grep -E "^\[ Context" | grep -c -E "botpbx-ivr|botpbx-ai|botpbx-campaign|from-trunk" || echo "0")
if [ "$CONTEXTS_FOUND" -ge 3 ]; then
    echo -e "  ${GREEN}✓${NC} BotPBX dialplan contexts configured ($CONTEXTS_FOUND contexts)"
else
    echo -e "  ${YELLOW}!${NC} Some dialplan contexts missing (found $CONTEXTS_FOUND/4)"
fi

# Verify RTP config
if [ -f /etc/asterisk/rtp.conf ]; then
    echo -e "  ${GREEN}✓${NC} RTP configuration present"
else
    echo -e "  ${YELLOW}!${NC} RTP configuration missing"
fi

# ============================================
# Final Summary
# ============================================
echo ""
echo -e "${CYAN}"
cat << 'EOF'
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║              BotPBX Installation Complete!                       ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo -e "${GREEN}Web Admin:${NC}  http://${PUBLIC_IP}:3001"
echo -e "${GREEN}API:${NC}        http://${PUBLIC_IP}:3000"
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Default Admin Credentials:${NC}"
echo -e "  Username: ${CYAN}admin${NC}"
echo -e "  Password: ${CYAN}${ADMIN_PASSWORD}${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "Credentials saved to: ${CYAN}${BOTPBX_DIR}/.env${NC}"
echo -e "                      ${CYAN}${BOTPBX_DIR}/credentials.txt${NC}"
echo -e "Installation log: ${CYAN}${LOG_FILE}${NC}"
echo ""
echo -e "${BLUE}PM2 Commands:${NC}"
echo "  pm2 status        - View service status"
echo "  pm2 logs          - View logs"
echo "  pm2 restart all   - Restart services"
echo ""
echo -e "${BLUE}Asterisk Commands:${NC}"
echo "  asterisk -rx 'pjsip show endpoints'  - View extensions"
echo "  asterisk -rx 'core show channels'    - View active calls"
echo "  asterisk -rx 'module show'           - View loaded modules"
echo ""
echo -e "${BLUE}Firewall Ports Open:${NC}"
echo "  3000/tcp  - Backend API"
echo "  3001/tcp  - Web Admin UI"
echo "  5060/udp  - SIP"
echo "  8089/tcp  - WebRTC WSS"
echo "  4573/tcp  - AGI Server"
echo "  9092/tcp  - AudioSocket AI"
echo "  9093/tcp  - Browser Audio"
echo "  5050/tcp  - Piper TTS"
echo "  5003/tcp  - Kokoro TTS"
echo "  10000-20000/udp - RTP Media"
echo ""

echo -e "${BLUE}TTS Engines Available:${NC}"
echo "  Piper TTS  - Fast, local, English voices"
echo "  Kokoro TTS - High quality, multiple voices"
echo "  Configure AI providers in Settings > AI Providers"
echo ""

# Save credentials
cat > "$BOTPBX_DIR/credentials.txt" << EOF
BotPBX Credentials
Generated: $(date)
Asterisk Version: $(asterisk -V 2>/dev/null || echo "22.x")

Web Admin: http://${PUBLIC_IP}:3001
API: http://${PUBLIC_IP}:3000

Admin Login:
  Username: admin
  Password: ${ADMIN_PASSWORD}

Database:
  Host: localhost
  Database: botpbx
  User: botpbx
  Password: ${DB_PASSWORD}

Asterisk AMI:
  Host: 127.0.0.1
  Port: 5038
  User: botpbx
  Secret: ${AMI_SECRET}

JWT Secret: ${JWT_SECRET}

Firewall Ports:
  3000/tcp  - Backend API
  3001/tcp  - Web Admin UI
  5060/udp  - SIP
  8089/tcp  - WebRTC WSS
  4573/tcp  - AGI Server
  9092/tcp  - AudioSocket AI
  9093/tcp  - Browser Audio
  5050/tcp  - Piper TTS
  5003/tcp  - Kokoro TTS
  10000-20000/udp - RTP Media

TTS Engines:
  Piper TTS:  http://127.0.0.1:5050 (local, fast)
  Kokoro TTS: http://127.0.0.1:5003 (high quality)
EOF

chmod 600 "$BOTPBX_DIR/credentials.txt"

echo ""
log "Installation complete! Asterisk 22 with all modules ready."
