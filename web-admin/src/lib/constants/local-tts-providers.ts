/**
 * Local TTS Provider configurations.
 * These providers run locally without cloud API keys.
 */

export interface LocalTtsModel {
  id: string;
  name: string;
  language: string;
  quality: 'low' | 'medium' | 'high';
  size: string; // Human-readable size
  sizeBytes: number;
  description?: string;
  gender?: 'male' | 'female' | 'neutral';
}

export interface LocalTtsProvider {
  id: string;
  name: string;
  description: string;
  badge: string;
  features: string[];
  website: string;
  models: LocalTtsModel[];
  defaultModel: string;
  available?: boolean; // false = coming soon
}

// Piper TTS - High quality offline TTS
export const PIPER_PROVIDER: LocalTtsProvider = {
  id: 'piper',
  name: 'Piper TTS',
  description: 'High-quality offline text-to-speech with 200+ voices. Runs completely locally.',
  badge: 'Free & Offline',
  features: ['No API key needed', 'Runs locally', '200+ voices', 'Multiple languages', 'Fast inference'],
  website: 'https://github.com/rhasspy/piper',
  defaultModel: 'en_US-lessac-medium',
  available: true,
  models: [
    // ===== English US =====
    { id: 'en_US-lessac-low', name: 'Lessac (Low)', language: 'en-US', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'Fast, lower quality', gender: 'female' },
    { id: 'en_US-lessac-medium', name: 'Lessac (Medium)', language: 'en-US', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Recommended - balanced quality', gender: 'female' },
    { id: 'en_US-lessac-high', name: 'Lessac (High)', language: 'en-US', quality: 'high', size: '107 MB', sizeBytes: 112197632, description: 'Best quality, slower', gender: 'female' },
    { id: 'en_US-amy-low', name: 'Amy (Low)', language: 'en-US', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'American female - fast', gender: 'female' },
    { id: 'en_US-amy-medium', name: 'Amy (Medium)', language: 'en-US', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'American female', gender: 'female' },
    { id: 'en_US-ryan-low', name: 'Ryan (Low)', language: 'en-US', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'American male - fast', gender: 'male' },
    { id: 'en_US-ryan-medium', name: 'Ryan (Medium)', language: 'en-US', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'American male', gender: 'male' },
    { id: 'en_US-ryan-high', name: 'Ryan (High)', language: 'en-US', quality: 'high', size: '107 MB', sizeBytes: 112197632, description: 'American male - best quality', gender: 'male' },
    { id: 'en_US-joe-medium', name: 'Joe (Medium)', language: 'en-US', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'American male - casual', gender: 'male' },
    { id: 'en_US-kusal-medium', name: 'Kusal (Medium)', language: 'en-US', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'American male', gender: 'male' },
    { id: 'en_US-kristin-medium', name: 'Kristin (Medium)', language: 'en-US', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'American female - clear', gender: 'female' },
    { id: 'en_US-libritts-high', name: 'LibriTTS (High)', language: 'en-US', quality: 'high', size: '107 MB', sizeBytes: 112197632, description: 'Multi-speaker high quality', gender: 'neutral' },
    { id: 'en_US-libritts_r-medium', name: 'LibriTTS-R (Medium)', language: 'en-US', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Multi-speaker refined', gender: 'neutral' },
    { id: 'en_US-ljspeech-low', name: 'LJSpeech (Low)', language: 'en-US', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'Female audiobook voice', gender: 'female' },
    { id: 'en_US-ljspeech-medium', name: 'LJSpeech (Medium)', language: 'en-US', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Female audiobook voice', gender: 'female' },
    { id: 'en_US-ljspeech-high', name: 'LJSpeech (High)', language: 'en-US', quality: 'high', size: '107 MB', sizeBytes: 112197632, description: 'Female audiobook voice - premium', gender: 'female' },
    { id: 'en_US-arctic-medium', name: 'Arctic (Medium)', language: 'en-US', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Clear American voice', gender: 'neutral' },
    { id: 'en_US-hfc_female-medium', name: 'HFC Female (Medium)', language: 'en-US', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'High fidelity female', gender: 'female' },
    { id: 'en_US-hfc_male-medium', name: 'HFC Male (Medium)', language: 'en-US', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'High fidelity male', gender: 'male' },
    { id: 'en_US-danny-low', name: 'Danny (Low)', language: 'en-US', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'American male - young', gender: 'male' },

    // ===== English UK =====
    { id: 'en_GB-alan-low', name: 'Alan (Low)', language: 'en-GB', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'British male - fast', gender: 'male' },
    { id: 'en_GB-alan-medium', name: 'Alan (Medium)', language: 'en-GB', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'British male', gender: 'male' },
    { id: 'en_GB-alba-medium', name: 'Alba (Medium)', language: 'en-GB', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Scottish female', gender: 'female' },
    { id: 'en_GB-aru-medium', name: 'Aru (Medium)', language: 'en-GB', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'British female', gender: 'female' },
    { id: 'en_GB-cori-low', name: 'Cori (Low)', language: 'en-GB', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'British female - fast', gender: 'female' },
    { id: 'en_GB-cori-medium', name: 'Cori (Medium)', language: 'en-GB', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'British female', gender: 'female' },
    { id: 'en_GB-cori-high', name: 'Cori (High)', language: 'en-GB', quality: 'high', size: '107 MB', sizeBytes: 112197632, description: 'British female - premium', gender: 'female' },
    { id: 'en_GB-jenny_dioco-medium', name: 'Jenny (Medium)', language: 'en-GB', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'British female - professional', gender: 'female' },
    { id: 'en_GB-northern_english_male-medium', name: 'Northern Male (Medium)', language: 'en-GB', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Northern English male', gender: 'male' },
    { id: 'en_GB-semaine-medium', name: 'Semaine (Medium)', language: 'en-GB', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'British female - expressive', gender: 'female' },
    { id: 'en_GB-vctk-medium', name: 'VCTK (Medium)', language: 'en-GB', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Multi-speaker British', gender: 'neutral' },

    // ===== Spanish =====
    { id: 'es_ES-carlfm-x_low', name: 'Carlfm (Low)', language: 'es-ES', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'Spanish male - fast', gender: 'male' },
    { id: 'es_ES-davefx-medium', name: 'DaveFX (Medium)', language: 'es-ES', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Spanish male', gender: 'male' },
    { id: 'es_ES-mls_9972-low', name: 'MLS 9972 (Low)', language: 'es-ES', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'Spanish female', gender: 'female' },
    { id: 'es_ES-mls_10246-low', name: 'MLS 10246 (Low)', language: 'es-ES', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'Spanish male', gender: 'male' },
    { id: 'es_ES-sharvard-medium', name: 'SHarvard (Medium)', language: 'es-ES', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Spanish female - clear', gender: 'female' },
    { id: 'es_MX-ald-medium', name: 'Ald (Medium)', language: 'es-MX', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Mexican Spanish male', gender: 'male' },
    { id: 'es_MX-claude-high', name: 'Claude (High)', language: 'es-MX', quality: 'high', size: '107 MB', sizeBytes: 112197632, description: 'Mexican Spanish male - premium', gender: 'male' },

    // ===== French =====
    { id: 'fr_FR-gilles-low', name: 'Gilles (Low)', language: 'fr-FR', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'French male - fast', gender: 'male' },
    { id: 'fr_FR-mls_1840-low', name: 'MLS 1840 (Low)', language: 'fr-FR', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'French female', gender: 'female' },
    { id: 'fr_FR-siwis-low', name: 'Siwis (Low)', language: 'fr-FR', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'French female - fast', gender: 'female' },
    { id: 'fr_FR-siwis-medium', name: 'Siwis (Medium)', language: 'fr-FR', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'French female', gender: 'female' },
    { id: 'fr_FR-tom-medium', name: 'Tom (Medium)', language: 'fr-FR', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'French male', gender: 'male' },
    { id: 'fr_FR-upmc-medium', name: 'UPMC (Medium)', language: 'fr-FR', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'French academic voice', gender: 'neutral' },

    // ===== German =====
    { id: 'de_DE-thorsten-low', name: 'Thorsten (Low)', language: 'de-DE', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'German male - fast', gender: 'male' },
    { id: 'de_DE-thorsten-medium', name: 'Thorsten (Medium)', language: 'de-DE', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'German male', gender: 'male' },
    { id: 'de_DE-thorsten-high', name: 'Thorsten (High)', language: 'de-DE', quality: 'high', size: '107 MB', sizeBytes: 112197632, description: 'German male - premium', gender: 'male' },
    { id: 'de_DE-thorsten_emotional-medium', name: 'Thorsten Emotional (Medium)', language: 'de-DE', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'German male - expressive', gender: 'male' },
    { id: 'de_DE-eva_k-x_low', name: 'Eva K (Low)', language: 'de-DE', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'German female - fast', gender: 'female' },
    { id: 'de_DE-karlsson-low', name: 'Karlsson (Low)', language: 'de-DE', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'German male', gender: 'male' },
    { id: 'de_DE-kerstin-low', name: 'Kerstin (Low)', language: 'de-DE', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'German female', gender: 'female' },
    { id: 'de_DE-mls_6892-low', name: 'MLS 6892 (Low)', language: 'de-DE', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'German female', gender: 'female' },
    { id: 'de_DE-ramona-low', name: 'Ramona (Low)', language: 'de-DE', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'German female', gender: 'female' },
    { id: 'de_DE-pavoque-low', name: 'Pavoque (Low)', language: 'de-DE', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'German male', gender: 'male' },

    // ===== Italian =====
    { id: 'it_IT-riccardo-x_low', name: 'Riccardo (Low)', language: 'it-IT', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'Italian male - fast', gender: 'male' },
    { id: 'it_IT-paola-medium', name: 'Paola (Medium)', language: 'it-IT', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Italian female', gender: 'female' },

    // ===== Portuguese =====
    { id: 'pt_BR-edresson-low', name: 'Edresson (Low)', language: 'pt-BR', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'Brazilian Portuguese male', gender: 'male' },
    { id: 'pt_BR-faber-medium', name: 'Faber (Medium)', language: 'pt-BR', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Brazilian Portuguese male', gender: 'male' },
    { id: 'pt_PT-tugao-medium', name: 'Tugao (Medium)', language: 'pt-PT', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'European Portuguese male', gender: 'male' },

    // ===== Dutch =====
    { id: 'nl_NL-mls_5809-low', name: 'MLS 5809 (Low)', language: 'nl-NL', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'Dutch female', gender: 'female' },
    { id: 'nl_NL-mls_7432-low', name: 'MLS 7432 (Low)', language: 'nl-NL', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'Dutch male', gender: 'male' },
    { id: 'nl_BE-nathalie-medium', name: 'Nathalie (Medium)', language: 'nl-BE', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Belgian Dutch female', gender: 'female' },
    { id: 'nl_BE-rdh-medium', name: 'RDH (Medium)', language: 'nl-BE', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Belgian Dutch male', gender: 'male' },

    // ===== Polish =====
    { id: 'pl_PL-darkman-medium', name: 'Darkman (Medium)', language: 'pl-PL', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Polish male', gender: 'male' },
    { id: 'pl_PL-gosia-medium', name: 'Gosia (Medium)', language: 'pl-PL', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Polish female', gender: 'female' },
    { id: 'pl_PL-mc_speech-medium', name: 'MC Speech (Medium)', language: 'pl-PL', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Polish male - clear', gender: 'male' },
    { id: 'pl_PL-mls_6892-low', name: 'MLS 6892 (Low)', language: 'pl-PL', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'Polish female', gender: 'female' },

    // ===== Russian =====
    { id: 'ru_RU-denis-medium', name: 'Denis (Medium)', language: 'ru-RU', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Russian male', gender: 'male' },
    { id: 'ru_RU-dmitri-medium', name: 'Dmitri (Medium)', language: 'ru-RU', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Russian male - deep', gender: 'male' },
    { id: 'ru_RU-irina-medium', name: 'Irina (Medium)', language: 'ru-RU', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Russian female', gender: 'female' },
    { id: 'ru_RU-ruslan-medium', name: 'Ruslan (Medium)', language: 'ru-RU', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Russian male - young', gender: 'male' },

    // ===== Chinese =====
    { id: 'zh_CN-huayan-medium', name: 'Huayan (Medium)', language: 'zh-CN', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Mandarin Chinese female', gender: 'female' },
    { id: 'zh_CN-huayan-x_low', name: 'Huayan (Low)', language: 'zh-CN', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'Mandarin Chinese female - fast', gender: 'female' },

    // ===== Other Languages =====
    { id: 'ca_ES-upc_ona-medium', name: 'Ona (Medium)', language: 'ca-ES', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Catalan female', gender: 'female' },
    { id: 'ca_ES-upc_pau-x_low', name: 'Pau (Low)', language: 'ca-ES', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'Catalan male', gender: 'male' },
    { id: 'cs_CZ-jirka-medium', name: 'Jirka (Medium)', language: 'cs-CZ', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Czech male', gender: 'male' },
    { id: 'da_DK-talesyntese-medium', name: 'Talesyntese (Medium)', language: 'da-DK', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Danish voice', gender: 'neutral' },
    { id: 'el_GR-rapunzelina-low', name: 'Rapunzelina (Low)', language: 'el-GR', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'Greek female', gender: 'female' },
    { id: 'fi_FI-harri-low', name: 'Harri (Low)', language: 'fi-FI', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'Finnish male', gender: 'male' },
    { id: 'fi_FI-harri-medium', name: 'Harri (Medium)', language: 'fi-FI', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Finnish male', gender: 'male' },
    { id: 'hu_HU-anna-medium', name: 'Anna (Medium)', language: 'hu-HU', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Hungarian female', gender: 'female' },
    { id: 'hu_HU-bea-medium', name: 'Bea (Medium)', language: 'hu-HU', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Hungarian female', gender: 'female' },
    { id: 'is_IS-bui-medium', name: 'Bui (Medium)', language: 'is-IS', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Icelandic male', gender: 'male' },
    { id: 'is_IS-salka-medium', name: 'Salka (Medium)', language: 'is-IS', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Icelandic female', gender: 'female' },
    { id: 'ka_GE-natia-medium', name: 'Natia (Medium)', language: 'ka-GE', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Georgian female', gender: 'female' },
    { id: 'kk_KZ-iseke-x_low', name: 'Iseke (Low)', language: 'kk-KZ', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'Kazakh male', gender: 'male' },
    { id: 'lb_LU-marylux-medium', name: 'Marylux (Medium)', language: 'lb-LU', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Luxembourgish female', gender: 'female' },
    { id: 'ne_NP-google-medium', name: 'Google (Medium)', language: 'ne-NP', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Nepali voice', gender: 'neutral' },
    { id: 'no_NO-talesyntese-medium', name: 'Talesyntese (Medium)', language: 'no-NO', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Norwegian voice', gender: 'neutral' },
    { id: 'ro_RO-mihai-medium', name: 'Mihai (Medium)', language: 'ro-RO', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Romanian male', gender: 'male' },
    { id: 'sk_SK-lili-medium', name: 'Lili (Medium)', language: 'sk-SK', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Slovak female', gender: 'female' },
    { id: 'sl_SI-artur-medium', name: 'Artur (Medium)', language: 'sl-SI', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Slovenian male', gender: 'male' },
    { id: 'sr_RS-serbski_institut-medium', name: 'Serbski Institut (Medium)', language: 'sr-RS', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Serbian voice', gender: 'neutral' },
    { id: 'sv_SE-nst-medium', name: 'NST (Medium)', language: 'sv-SE', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Swedish voice', gender: 'neutral' },
    { id: 'sw_CD-lanfrica-medium', name: 'Lanfrica (Medium)', language: 'sw-CD', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Swahili voice', gender: 'neutral' },
    { id: 'tr_TR-dfki-medium', name: 'DFKI (Medium)', language: 'tr-TR', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Turkish voice', gender: 'neutral' },
    { id: 'tr_TR-fahrettin-medium', name: 'Fahrettin (Medium)', language: 'tr-TR', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Turkish male', gender: 'male' },
    { id: 'uk_UA-lada-x_low', name: 'Lada (Low)', language: 'uk-UA', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'Ukrainian female', gender: 'female' },
    { id: 'uk_UA-ukrainian_tts-medium', name: 'Ukrainian TTS (Medium)', language: 'uk-UA', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Ukrainian voice', gender: 'neutral' },
    { id: 'vi_VN-25hours_single-low', name: '25hours (Low)', language: 'vi-VN', quality: 'low', size: '16 MB', sizeBytes: 16777216, description: 'Vietnamese female', gender: 'female' },
    { id: 'vi_VN-vais1000-medium', name: 'VAIS1000 (Medium)', language: 'vi-VN', quality: 'medium', size: '63 MB', sizeBytes: 66060288, description: 'Vietnamese voice', gender: 'neutral' },
  ],
};

// Kokoro TTS - Lightweight local TTS
export const KOKORO_PROVIDER: LocalTtsProvider = {
  id: 'kokoro',
  name: 'Kokoro TTS',
  description: 'Lightweight 82M parameter model. Fast and efficient for real-time synthesis.',
  badge: 'Lightweight',
  features: ['No API key needed', 'Very fast', 'Small model (82M)', 'Multi-language', 'Low memory usage'],
  website: 'https://huggingface.co/hexgrad/Kokoro-82M',
  defaultModel: 'af_heart',
  available: true,
  models: [
    // Female voices
    { id: 'af_heart', name: 'Heart', language: 'en-US', quality: 'medium', size: '330 MB', sizeBytes: 346030080, description: 'Default female voice - warm and expressive', gender: 'female' },
    { id: 'af_bella', name: 'Bella', language: 'en-US', quality: 'medium', size: '330 MB', sizeBytes: 346030080, description: 'Female voice - clear and professional', gender: 'female' },
    { id: 'af_sarah', name: 'Sarah', language: 'en-US', quality: 'medium', size: '330 MB', sizeBytes: 346030080, description: 'Female voice - friendly', gender: 'female' },
    { id: 'af_nicole', name: 'Nicole', language: 'en-US', quality: 'medium', size: '330 MB', sizeBytes: 346030080, description: 'Female voice - soft', gender: 'female' },
    { id: 'af_sky', name: 'Sky', language: 'en-US', quality: 'medium', size: '330 MB', sizeBytes: 346030080, description: 'Female voice - bright', gender: 'female' },

    // Male voices
    { id: 'am_adam', name: 'Adam', language: 'en-US', quality: 'medium', size: '330 MB', sizeBytes: 346030080, description: 'Male voice - strong and clear', gender: 'male' },
    { id: 'am_michael', name: 'Michael', language: 'en-US', quality: 'medium', size: '330 MB', sizeBytes: 346030080, description: 'Male voice - friendly', gender: 'male' },

    // British voices
    { id: 'bf_emma', name: 'Emma (British)', language: 'en-GB', quality: 'medium', size: '330 MB', sizeBytes: 346030080, description: 'British female voice', gender: 'female' },
    { id: 'bf_isabella', name: 'Isabella (British)', language: 'en-GB', quality: 'medium', size: '330 MB', sizeBytes: 346030080, description: 'British female voice - elegant', gender: 'female' },
    { id: 'bm_george', name: 'George (British)', language: 'en-GB', quality: 'medium', size: '330 MB', sizeBytes: 346030080, description: 'British male voice', gender: 'male' },
    { id: 'bm_lewis', name: 'Lewis (British)', language: 'en-GB', quality: 'medium', size: '330 MB', sizeBytes: 346030080, description: 'British male voice - professional', gender: 'male' },
  ],
};

// All local providers
export const LOCAL_TTS_PROVIDERS: LocalTtsProvider[] = [
  PIPER_PROVIDER,
  KOKORO_PROVIDER,
];

// Get provider by ID
export function getLocalTtsProvider(id: string): LocalTtsProvider | undefined {
  return LOCAL_TTS_PROVIDERS.find(p => p.id === id);
}

// Get all model IDs for a provider
export function getProviderModelIds(providerId: string): string[] {
  const provider = getLocalTtsProvider(providerId);
  return provider?.models.map(m => m.id) || [];
}

// Get model by ID across all providers
export function getLocalTtsModel(modelId: string): LocalTtsModel | undefined {
  for (const provider of LOCAL_TTS_PROVIDERS) {
    const model = provider.models.find(m => m.id === modelId);
    if (model) return model;
  }
  return undefined;
}

// Format bytes to human readable
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// Get total size for multiple models
export function getTotalSize(modelIds: string[]): number {
  return modelIds.reduce((total, id) => {
    const model = getLocalTtsModel(id);
    return total + (model?.sizeBytes || 0);
  }, 0);
}
