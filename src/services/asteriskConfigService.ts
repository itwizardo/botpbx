import * as fs from 'fs';
import * as path from 'path';
import * as dns from 'dns';
import { promisify } from 'util';
import { logger } from '../utils/logger';
import { Extension, SIPTrunk } from '../models/types';
import { ExtensionRepository } from '../db/repositories/extensionRepository';
import { TrunkRepository } from '../db/repositories/trunkRepository';

const dnsLookup = promisify(dns.lookup);

export class AsteriskConfigService {
  private configPath: string;
  private extensionRepo: ExtensionRepository;
  private trunkRepo: TrunkRepository | null = null;

  constructor(configPath: string, extensionRepo: ExtensionRepository, trunkRepo?: TrunkRepository) {
    this.configPath = configPath;
    this.extensionRepo = extensionRepo;
    this.trunkRepo = trunkRepo || null;
  }

  /**
   * Set the trunk repository (can be set after construction)
   */
  setTrunkRepo(trunkRepo: TrunkRepository): void {
    this.trunkRepo = trunkRepo;
  }

  /**
   * Generate http.conf for WebSocket support
   */
  generateHttpConf(): string {
    return `; ===============================================
; BotPBX HTTP/WebSocket Configuration
; ===============================================

[general]
enabled=yes
bindaddr=0.0.0.0
bindport=8088
enablestatic=no
`;
  }

  /**
   * Write http.conf
   */
  async writeHttpConf(): Promise<boolean> {
    const configContent = this.generateHttpConf();
    const filePath = path.join(this.configPath, 'http.conf');

    try {
      if (fs.existsSync(filePath)) {
        const backupPath = `${filePath}.bak`;
        fs.copyFileSync(filePath, backupPath);
      }
      fs.writeFileSync(filePath, configContent);
      logger.info(`HTTP config written to: ${filePath}`);
      return true;
    } catch (error) {
      logger.error(`Failed to write http.conf: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Generate browser WebRTC endpoint for web admin phone
   * This endpoint allows authenticated users to make calls from the browser
   */
  private generateBrowserEndpoint(): string {
    return `
; ===============================================
; Browser WebRTC Endpoint
; Auto-generated for web admin phone functionality
; ===============================================

[browser](webrtc-template)
auth=browser-auth
aors=browser
context=browser-calls
callerid="Browser Phone" <browser>
set_var=BROWSER_TRUNK=\${PJSIP_HEADER(read,X-Browser-Trunk)}
set_var=BROWSER_CALLERID=\${PJSIP_HEADER(read,X-Browser-CallerID)}

[browser-auth]
type=auth
auth_type=userpass
username=browser
password=${process.env.BROWSER_WEBRTC_PASSWORD || 'ChangeThisPassword!'}

[browser]
type=aor
max_contacts=5
remove_existing=yes

`;
  }

  /**
   * Generate PJSIP extensions configuration file
   * This file should be #included in the main pjsip.conf
   * Multi-tenant: Extensions are prefixed with tenant ID for isolation
   */
  async generatePJSIPExtensions(): Promise<string> {
    // Use findAllForAsterisk to get all enabled extensions across tenants
    const extensions = await this.extensionRepo.findAllForAsterisk();

    let config = `; ===============================================
; BotPBX Auto-Generated PJSIP Extensions
; Generated: ${new Date().toISOString()}
; DO NOT EDIT MANUALLY - Changes will be overwritten
; Multi-Tenant Enabled
; ===============================================

`;

    // Add browser WebRTC endpoint first
    config += this.generateBrowserEndpoint();

    // Group extensions by tenant for organization
    const byTenant = new Map<string, typeof extensions>();
    for (const ext of extensions) {
      const tenantExts = byTenant.get(ext.tenantId) || [];
      tenantExts.push(ext);
      byTenant.set(ext.tenantId, tenantExts);
    }

    // Generate config for each tenant's extensions
    for (const [tenantId, tenantExts] of byTenant) {
      config += `
; ===============================================
; Tenant: ${tenantId}
; ===============================================
`;
      for (const ext of tenantExts) {
        config += this.generateExtensionConfig(ext, tenantId);
      }
    }

    return config;
  }

  /**
   * Generate configuration for a single extension
   * Multi-tenant: Uses full endpoint name with tenant prefix for uniqueness
   * but the username for registration remains the extension number only
   */
  private generateExtensionConfig(ext: Extension & { tenantId: string }, tenantId: string): string {
    const number = ext.number;
    const name = ext.name.replace(/[^a-zA-Z0-9\s]/g, ''); // Sanitize name
    // For multi-tenant, prefix endpoint names with tenant short ID
    // But keep username as just the extension number for simpler SIP registration
    const tenantPrefix = tenantId === 'default' ? '' : `t${tenantId.substring(0, 8)}_`;
    const endpointName = `${tenantPrefix}${number}`;
    const tenantContext = tenantId === 'default' ? 'internal' : `tenant-${tenantId.substring(0, 8)}`;

    return `
; Extension ${number} - ${name} (Tenant: ${tenantId})
[${endpointName}](endpoint-template)
auth=${endpointName}-auth
aors=${endpointName}
callerid="${name}" <${number}>
context=${tenantContext}
set_var=TENANT_ID=${tenantId}

[${endpointName}-auth](auth-template)
username=${number}
password=${ext.password}

[${endpointName}](aor-template)

`;
  }

  /**
   * Write the PJSIP extensions config to file
   */
  async writePJSIPConfig(): Promise<boolean> {
    const configContent = await this.generatePJSIPExtensions();
    const filePath = path.join(this.configPath, 'pjsip_extensions.conf');

    try {
      // Create backup of existing file
      if (fs.existsSync(filePath)) {
        const backupPath = `${filePath}.bak`;
        fs.copyFileSync(filePath, backupPath);
        logger.info(`Backed up existing config to: ${backupPath}`);
      }

      // Write new config
      fs.writeFileSync(filePath, configContent);
      logger.info(`PJSIP extensions config written to: ${filePath}`);

      return true;
    } catch (error) {
      logger.error(`Failed to write PJSIP config: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Resolve hostname to IP address (for PJSIP to avoid SRV lookup issues)
   */
  private async resolveHostToIP(host: string): Promise<string> {
    // If already an IP address, return as-is
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipRegex.test(host)) {
      return host;
    }

    try {
      const result = await dnsLookup(host);
      logger.info(`Resolved ${host} to ${result.address}`);
      return result.address;
    } catch (error) {
      logger.warn(`Could not resolve ${host}, using hostname: ${(error as Error).message}`);
      return host;
    }
  }

  /**
   * Generate PJSIP trunk configuration
   * Multi-tenant: Trunks are prefixed with tenant ID
   */
  async generateTrunkConfig(): Promise<string> {
    if (!this.trunkRepo) {
      return '; No trunk repository configured\n';
    }

    // Use findAllForAsterisk to get all enabled trunks across tenants
    const trunks = await this.trunkRepo.findAllForAsterisk();

    let config = `; ===============================================
; BotPBX Auto-Generated SIP Trunks
; Generated: ${new Date().toISOString()}
; DO NOT EDIT MANUALLY - Changes will be overwritten
; Multi-Tenant Enabled
; ===============================================

`;

    // Group by tenant
    const byTenant = new Map<string, typeof trunks>();
    for (const trunk of trunks) {
      const tenantTrunks = byTenant.get(trunk.tenantId) || [];
      tenantTrunks.push(trunk);
      byTenant.set(trunk.tenantId, tenantTrunks);
    }

    for (const [tenantId, tenantTrunks] of byTenant) {
      config += `
; ===============================================
; Tenant: ${tenantId} Trunks
; ===============================================
`;
      for (const trunk of tenantTrunks) {
        config += await this.generateSingleTrunkConfig(trunk, tenantId);
      }
    }

    return config;
  }

  /**
   * Generate configuration for a single SIP trunk
   * Multi-tenant: Trunk names are prefixed with tenant ID
   */
  private async generateSingleTrunkConfig(trunk: SIPTrunk & { tenantId: string }, tenantId: string): Promise<string> {
    // Prefix trunk name with tenant for uniqueness
    const tenantPrefix = tenantId === 'default' ? '' : `t${tenantId.substring(0, 8)}-`;
    const trunkName = `${tenantPrefix}${trunk.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const codecs = trunk.codecs.split(',').map(c => `allow=${c.trim()}`).join('\n');

    // Resolve hostname to IP to avoid PJSIP SRV lookup issues
    const hostIP = await this.resolveHostToIP(trunk.host);

    let config = `
; ===============================================
; Trunk: ${trunk.name} (Tenant: ${tenantId})
; Host: ${trunk.host} (${hostIP}):${trunk.port}
; ===============================================

`;

    // Registration (if enabled)
    if (trunk.register) {
      config += `[${trunkName}-reg]
type=registration
transport=transport-udp
outbound_auth=${trunkName}-auth
server_uri=sip:${hostIP}:${trunk.port}
client_uri=sip:${trunk.username}@${hostIP}
retry_interval=60
line=yes
endpoint=${trunkName}

`;
    }

    // Authentication
    // Note: realm is intentionally omitted - Asterisk will automatically use
    // the realm from the provider's SIP challenge, which works with any provider
    config += `[${trunkName}-auth]
type=auth
auth_type=userpass
username=${trunk.authUsername || trunk.username}
password=${trunk.password}

`;

    // AOR (Address of Record)
    // Use hostname (not resolved IP) so the Request-URI contains the domain.
    // Providers like Twilio need the domain in the URI to route calls correctly.
    const aorHost = trunk.host;
    const aorContact = trunk.port === 5061
      ? `sip:${aorHost}:${trunk.port};transport=tls`
      : `sip:${aorHost}:${trunk.port}`;
    config += `[${trunkName}-aor]
type=aor
contact=${aorContact}
qualify_frequency=30

`;

    // Endpoint - use TLS transport for port 5061 (Twilio etc)
    const transportType = trunk.port === 5061 ? 'transport-tls-twilio' : 'transport-udp';
    config += `[${trunkName}]
type=endpoint
transport=${transportType}
context=${trunk.context}
disallow=all
${codecs}
outbound_auth=${trunkName}-auth
aors=${trunkName}-aor
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes
inband_progress=no
from_user=${trunk.fromUser || trunk.username}
from_domain=${trunk.fromDomain || hostIP}
send_pai=yes
trust_id_outbound=yes
${trunk.stirShakenEnabled ? `stir_shaken_profile=${trunk.stirShakenProfile || 'default'}` : ''}

`;

    // Identify (match incoming by IP)
    config += `[${trunkName}-identify]
type=identify
endpoint=${trunkName}
match=${hostIP}

`;

    return config;
  }

  /**
   * Write the SIP trunk config to file
   */
  async writeTrunkConfig(): Promise<boolean> {
    const configContent = await this.generateTrunkConfig();
    const filePath = path.join(this.configPath, 'pjsip_trunks.conf');

    try {
      // Create backup of existing file
      if (fs.existsSync(filePath)) {
        const backupPath = `${filePath}.bak`;
        fs.copyFileSync(filePath, backupPath);
        logger.info(`Backed up existing trunk config to: ${backupPath}`);
      }

      // Write new config
      fs.writeFileSync(filePath, configContent);
      logger.info(`PJSIP trunk config written to: ${filePath}`);

      // Also write STIR/SHAKEN config if any trunk uses it
      await this.writeStirShakenConfig();

      return true;
    } catch (error) {
      logger.error(`Failed to write trunk config: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Generate STIR/SHAKEN configuration
   */
  async generateStirShakenConfig(): Promise<string | null> {
    if (!this.trunkRepo) {
      return null;
    }

    const trunks = await this.trunkRepo.findAllForAsterisk();
    const stirTrunks = trunks.filter(t => t.stirShakenEnabled);

    if (stirTrunks.length === 0) {
      return null;
    }

    let config = `; ===============================================
; BotPBX STIR/SHAKEN Configuration
; Generated: ${new Date().toISOString()}
; DO NOT EDIT MANUALLY - Changes will be overwritten
; ===============================================

`;

    // Create profiles for each unique attestation level
    const attestLevels = new Set(stirTrunks.map(t => t.stirShakenAttest || 'B'));

    for (const attest of attestLevels) {
      config += `[stir-${attest.toLowerCase()}]
type=profile
endpoint_behavior=on
attest_level=${attest}

`;
    }

    // Default profile
    config += `[default]
type=profile
endpoint_behavior=on
attest_level=B

`;

    return config;
  }

  /**
   * Write STIR/SHAKEN config to file
   */
  async writeStirShakenConfig(): Promise<boolean> {
    const configContent = await this.generateStirShakenConfig();

    if (!configContent) {
      return true; // No STIR/SHAKEN trunks, nothing to write
    }

    const filePath = path.join(this.configPath, 'stir_shaken.conf');

    try {
      // Create backup of existing file
      if (fs.existsSync(filePath)) {
        const backupPath = `${filePath}.bak`;
        fs.copyFileSync(filePath, backupPath);
      }

      // Write new config
      fs.writeFileSync(filePath, configContent);
      logger.info(`STIR/SHAKEN config written to: ${filePath}`);

      return true;
    } catch (error) {
      logger.error(`Failed to write STIR/SHAKEN config: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Generate the main PJSIP config template
   * This is for reference - the actual file should be set up manually
   */
  generatePJSIPMainTemplate(): string {
    return `; ===============================================
; BotPBX PJSIP Configuration Template
; Copy this to your /etc/asterisk/pjsip.conf
; ===============================================

[global]
type=global
user_agent=BotPBX PBX

; ===============================================
; TRANSPORT
; ===============================================
[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0:5060

; ===============================================
; TEMPLATES
; ===============================================

; Endpoint template for all extensions
[endpoint-template](!)
type=endpoint
context=internal
disallow=all
allow=ulaw
allow=alaw
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes
ice_support=no

; Auth template
[auth-template](!)
type=auth
auth_type=userpass

; AOR template
[aor-template](!)
type=aor
max_contacts=1
qualify_frequency=30
remove_existing=yes

; ===============================================
; SIP TRUNK (Example - customize for your provider)
; ===============================================

; Uncomment and configure for your SIP trunk provider
; [trunk-provider]
; type=registration
; outbound_auth=trunk-provider-auth
; server_uri=sip:sip.provider.com
; client_uri=sip:YOUR_USERNAME@sip.provider.com
; retry_interval=60
;
; [trunk-provider-auth]
; type=auth
; auth_type=userpass
; username=YOUR_USERNAME
; password=YOUR_PASSWORD
;
; [trunk-provider]
; type=aor
; contact=sip:sip.provider.com:5060
; qualify_frequency=30
;
; [trunk-provider]
; type=endpoint
; context=from-trunk
; disallow=all
; allow=ulaw
; allow=alaw
; outbound_auth=trunk-provider-auth
; aors=trunk-provider
; direct_media=no
;
; [trunk-provider]
; type=identify
; endpoint=trunk-provider
; match=sip.provider.com

; ===============================================
; INCLUDE AUTO-GENERATED CONFIGS
; ===============================================
#include pjsip_extensions.conf
#include pjsip_trunks.conf
`;
  }

  /**
   * Generate extensions.conf for IVR handling
   */
  generateExtensionsConf(): string {
    return `; ===============================================
; BotPBX Extensions Configuration
; Copy this to your /etc/asterisk/extensions.conf
; ===============================================

[general]
static=yes
writeprotect=no
autofallthrough=yes
clearglobalvars=no

; ===============================================
; GLOBALS
; ===============================================
[globals]
AGI_HOST=127.0.0.1
AGI_PORT=4573

; ===============================================
; FROM TRUNK (Inbound Calls)
; ===============================================
[from-trunk]
; All inbound calls go through AGI for IVR routing
exten => _X.,1,NoOp(Inbound call to \${EXTEN} from \${CALLERID(num)})
 same => n,Set(CHANNEL(language)=en)
 same => n,Answer()
 same => n,Wait(1)
 same => n,AGI(agi://\${AGI_HOST}:\${AGI_PORT}/ivr)
 same => n,Hangup()

; Handle invalid extensions
exten => i,1,NoOp(Invalid extension)
 same => n,Playback(invalid)
 same => n,Hangup()

; Handle timeout
exten => t,1,NoOp(Timeout)
 same => n,Playback(vm-goodbye)
 same => n,Hangup()

; ===============================================
; IVR CONTEXT
; ===============================================
[ivr]
; This context is controlled by AGI
; The AGI script handles all IVR logic
exten => _X.,1,NoOp(IVR handling for \${EXTEN})
 same => n,AGI(agi://\${AGI_HOST}:\${AGI_PORT}/ivr)
 same => n,Hangup()

; ===============================================
; INTERNAL EXTENSIONS
; ===============================================
[internal]
; Dial internal extensions (1XXX pattern)
exten => _1XXX,1,NoOp(Dialing extension \${EXTEN})
 same => n,Set(DIALTIME=30)
 same => n,Dial(PJSIP/\${EXTEN},\${DIALTIME},tTwW)
 same => n,NoOp(Dial status: \${DIALSTATUS})
 same => n,GotoIf($["\${DIALSTATUS}"="BUSY"]?busy)
 same => n,GotoIf($["\${DIALSTATUS}"="NOANSWER"]?noanswer)
 same => n,GotoIf($["\${DIALSTATUS}"="CHANUNAVAIL"]?unavail)
 same => n,Hangup()
 same => n(busy),Playback(vm-nobodyavail)
 same => n,Hangup()
 same => n(noanswer),VoiceMail(\${EXTEN}@default,u)
 same => n,Hangup()
 same => n(unavail),VoiceMail(\${EXTEN}@default,u)
 same => n,Hangup()

; Dial external numbers (outbound)
exten => _NXXNXXXXXX,1,NoOp(Outbound call to \${EXTEN})
 same => n,Set(CALLERID(num)=\${DEFAULT_CALLERID})
 same => n,Dial(PJSIP/+1\${EXTEN}@trunk-provider,60)
 same => n,Hangup()

; E.164 format outbound
exten => _+1NXXNXXXXXX,1,NoOp(Outbound call to \${EXTEN})
 same => n,Set(CALLERID(num)=\${DEFAULT_CALLERID})
 same => n,Dial(PJSIP/\${EXTEN}@trunk-provider,60)
 same => n,Hangup()

; ===============================================
; TRANSFER HANDLING
; ===============================================
[transfer]
; Allow transfers to internal extensions
exten => _1XXX,1,Goto(internal,\${EXTEN},1)

; ===============================================
; VOICEMAIL
; ===============================================
[voicemail]
exten => _1XXX,1,VoiceMail(\${EXTEN}@default)
 same => n,Hangup()

; Voicemail main menu
exten => *97,1,VoiceMailMain(\${CALLERID(num)}@default)
 same => n,Hangup()

; ===============================================
; TEST IVR CONTEXT (Telegram Bot Test Calls)
; ===============================================
[test-ivr]
; Called when user initiates "Test IVR Call" from Telegram
; Answers and routes through AGI to play the IVR
exten => s,1,NoOp(Test IVR call initiated)
 same => n,Answer()
 same => n,Wait(1)
 same => n,AGI(agi://\${AGI_HOST}:\${AGI_PORT}/ivr)
 same => n,Hangup()

exten => _X.,1,NoOp(Test IVR call to \${EXTEN})
 same => n,Answer()
 same => n,Wait(1)
 same => n,AGI(agi://\${AGI_HOST}:\${AGI_PORT}/ivr)
 same => n,Hangup()

; ===============================================
; OUTBOUND DIALER CONTEXT (Campaign Calls)
; ===============================================
[outbound-dialer]
; Called when dialer campaigns initiate outbound calls
; Uses AMD (Answering Machine Detection) before playing IVR
; AMD sets AMDSTATUS (MACHINE/HUMAN/NOTSURE/HANGUP) and AMDCAUSE
exten => s,1,NoOp(Outbound dialer call)
 same => n,Answer()
 same => n,Wait(0.5)
 same => n,AMD(2500,2000,3000,3500,300,10,3,256)
 same => n,NoOp(AMD Result: \${AMDSTATUS} Cause: \${AMDCAUSE})
 same => n,AGI(agi://\${AGI_HOST}:\${AGI_PORT}/outbound)
 same => n,Hangup()

exten => _X.,1,NoOp(Outbound dialer call to \${EXTEN})
 same => n,Answer()
 same => n,Wait(0.5)
 same => n,AMD(2500,2000,3000,3500,300,10,3,256)
 same => n,NoOp(AMD Result: \${AMDSTATUS} Cause: \${AMDCAUSE})
 same => n,AGI(agi://\${AGI_HOST}:\${AGI_PORT}/outbound)
 same => n,Hangup()

; ===============================================
; TEST CALL CONTEXT (Trunk Test Calls)
; ===============================================
[test-call]
; Called when user tests a SIP trunk from Telegram
exten => s,1,NoOp(Test call via trunk)
 same => n,Answer()
 same => n,Wait(1)
 same => n,Playback(hello-world)
 same => n,Echo()
 same => n,Hangup()

exten => _X.,1,NoOp(Test call to \${EXTEN})
 same => n,Answer()
 same => n,Wait(1)
 same => n,Playback(hello-world)
 same => n,Echo()
 same => n,Hangup()

; ===============================================
; IVR TEST CONTEXT (Web Admin IVR Tests)
; ===============================================
[ivr-test]
; Called when user tests IVR from web admin
; Uses IVR_MENU_ID variable passed from originate
exten => s,1,NoOp(IVR Test call - menu ID: \${IVR_MENU_ID})
 same => n,Answer()
 same => n,Wait(1)
 same => n,AGI(agi://\${AGI_HOST}:\${AGI_PORT}/ivr)
 same => n,Hangup()

; Catch-all for any extension pattern
exten => _.,1,NoOp(IVR Test call for menu \${EXTEN})
 same => n,Answer()
 same => n,Wait(1)
 same => n,Set(IVR_MENU_ID=\${EXTEN})
 same => n,AGI(agi://\${AGI_HOST}:\${AGI_PORT}/ivr)
 same => n,Hangup()

; ===============================================
; SPY CONTEXT (Call Monitoring from Web Admin)
; ===============================================
[spy]
; Used by web admin to spy on active calls
; SPYCHAN variable is set by originate call
exten => s,1,NoOp(Spy session starting for channel \${SPYCHAN})
 same => n,ChanSpy(\${SPYCHAN},qEB)
 same => n,Hangup()

; ===============================================
; BROWSER SPY CONTEXT (Browser-based Call Listening)
; ===============================================
[browser-spy]
; Browser spy - streams audio via AudioSocket to web browser
; SPYCHAN variable is the channel to spy on
; AUDIO_SESSION_ID is the unique session identifier for WebSocket
exten => s,1,NoOp(Browser spy starting for channel \${SPYCHAN})
 same => n,Answer()
 same => n,Set(AUDIO_UUID=\${AUDIO_SESSION_ID})
 same => n,ChanSpy(\${SPYCHAN},qEB(AudioSocket(127.0.0.1:9093,\${AUDIO_UUID})))
 same => n,Hangup()

[browser-spy-setup]
; Setup context for browser spy originate
exten => s,1,NoOp(Browser spy setup - channel: \${SPYCHAN}, session: \${AUDIO_SESSION_ID})
 same => n,Goto(browser-spy,s,1)

; ===============================================
; BROWSER CALLS CONTEXT (WebRTC Outbound Calling)
; ===============================================
[browser-calls]
; Browser WebRTC outbound calls
; BROWSER_TRUNK variable specifies which trunk to use
; BROWSER_CALLERID sets the outbound caller ID
exten => _X.,1,NoOp(Browser WebRTC call to \${EXTEN})
 same => n,NoOp(Using trunk: \${BROWSER_TRUNK}, CallerID: \${BROWSER_CALLERID})
 same => n,Set(CALLERID(num)=\${IF($["\${BROWSER_CALLERID}"!=""]?\${BROWSER_CALLERID}:\${DEFAULT_CALLERID})})
 same => n,Set(CALL_START_TIME=\${EPOCH})
 same => n,Set(RECORDING_FILE=/var/spool/asterisk/monitor/browser-\${STRFTIME(\${EPOCH},,%Y%m%d-%H%M%S)}-\${UNIQUEID}.wav)
 same => n,MixMonitor(\${RECORDING_FILE},ab)
 same => n,AGI(agi://127.0.0.1:4573/browser-call)
 same => n,GotoIf($["\${BROWSER_TRUNK}"=""]?default)
 same => n,Dial(PJSIP/\${EXTEN}@\${BROWSER_TRUNK},120,tTwW)
 same => n,Hangup()
 same => n(default),Dial(PJSIP/\${EXTEN}@trunk-provider,120,tTwW)
 same => n,Hangup()

; Handle hangup - complete recording
exten => h,1,NoOp(Browser call ended - cause: \${HANGUPCAUSE})
 same => n,Set(CALL_DURATION=$[\${EPOCH}-\${CALL_START_TIME}])
 same => n,AGI(agi://127.0.0.1:4573/browser-hangup)

; ===============================================
; AI AGENT TEST CONTEXT (OpenAI Realtime API)
; ===============================================
[ai-agent-test]
; Called when testing an AI agent from the web admin
; Uses AudioSocket to connect to OpenAI Realtime API bridge
; AGENT_ID and CALL_UUID are set by the originate call
exten => s,1,NoOp(AI Agent test call - Agent: \${AGENT_ID}, UUID: \${CALL_UUID})
 same => n,Answer()
 same => n,Wait(1)
 same => n,Set(CHANNEL(audioreadformat)=slin)
 same => n,Set(CHANNEL(audiowriteformat)=slin)
 same => n,AudioSocket(\${CALL_UUID},127.0.0.1:9092)
 same => n,Hangup()

exten => h,1,NoOp(AI Agent call ended - cause: \${HANGUPCAUSE})
`;
  }

  /**
   * Generate manager.conf for AMI access
   */
  generateManagerConf(): string {
    return `; ===============================================
; BotPBX AMI Configuration
; Copy this to your /etc/asterisk/manager.conf
; ===============================================

[general]
enabled=yes
port=5038
bindaddr=127.0.0.1

[botpbx]
secret=CHANGE_THIS_PASSWORD
deny=0.0.0.0/0.0.0.0
permit=127.0.0.1/255.255.255.255
read=system,call,log,agent,user,config,dtmf,reporting,cdr,dialplan,originate
write=system,call,agent,user,config,command,reporting,originate
eventfilter=!Event: RTCPSent
eventfilter=!Event: RTCPReceived
`;
  }

  /**
   * Write the extensions.conf to Asterisk config directory
   */
  async writeExtensionsConf(): Promise<boolean> {
    const configContent = this.generateExtensionsConf();
    const filePath = path.join(this.configPath, 'extensions.conf');

    try {
      // Create backup of existing file
      if (fs.existsSync(filePath)) {
        const backupPath = `${filePath}.bak`;
        fs.copyFileSync(filePath, backupPath);
        logger.info(`Backed up existing extensions.conf to: ${backupPath}`);
      }

      // Write new config
      fs.writeFileSync(filePath, configContent);
      logger.info(`Extensions config written to: ${filePath}`);

      return true;
    } catch (error) {
      logger.error(`Failed to write extensions.conf: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Write the main PJSIP config template to Asterisk config directory
   */
  async writePJSIPMainConfig(): Promise<boolean> {
    const filePath = path.join(this.configPath, 'pjsip.conf');

    // Only write if file doesn't exist (don't overwrite user customizations)
    if (fs.existsSync(filePath)) {
      logger.info('pjsip.conf already exists, skipping (use example file as reference)');
      return true;
    }

    const configContent = this.generatePJSIPMainTemplate();

    try {
      fs.writeFileSync(filePath, configContent);
      logger.info(`PJSIP main config written to: ${filePath}`);
      return true;
    } catch (error) {
      logger.error(`Failed to write pjsip.conf: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Write all Asterisk config files (called at startup)
   */
  async writeAllConfigs(): Promise<void> {
    // Ensure config directory exists
    if (!fs.existsSync(this.configPath)) {
      fs.mkdirSync(this.configPath, { recursive: true });
      logger.info(`Created Asterisk config directory: ${this.configPath}`);
    }

    // Write main pjsip.conf if it doesn't exist
    await this.writePJSIPMainConfig();

    // Write auto-generated configs (extensions and trunks)
    await this.writePJSIPConfig();
    await this.writeTrunkConfig();
    await this.writeHttpConf();

    // Write extensions.conf
    await this.writeExtensionsConf();
  }

  /**
   * Write all example config files to a directory
   */
  async writeExampleConfigs(outputDir: string): Promise<void> {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const configs = [
      { name: 'pjsip.conf.example', content: this.generatePJSIPMainTemplate() },
      { name: 'extensions.conf.example', content: this.generateExtensionsConf() },
      { name: 'manager.conf.example', content: this.generateManagerConf() },
    ];

    for (const config of configs) {
      const filePath = path.join(outputDir, config.name);
      fs.writeFileSync(filePath, config.content);
      logger.info(`Example config written: ${filePath}`);
    }
  }
}
