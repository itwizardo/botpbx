/**
 * Voice definitions for all TTS providers.
 * Includes cloud and local TTS voice options.
 */

export type VoiceGender = 'male' | 'female' | 'neutral';
export type VoiceStyle = 'professional' | 'warm' | 'energetic' | 'calm' | 'friendly' | 'authoritative';
export type VoiceQuality = 'standard' | 'hd' | 'neural';

export interface VoiceDefinition {
  id: string;
  name: string;
  provider: string;
  gender: VoiceGender;
  style: VoiceStyle[];
  language: string;
  quality: VoiceQuality;
  description?: string;
  color?: string; // For avatar
}

// OpenAI Realtime Voices
export const OPENAI_VOICES: VoiceDefinition[] = [
  { id: 'alloy', name: 'Alloy', provider: 'openai', gender: 'neutral', style: ['professional', 'calm'], language: 'en-US', quality: 'hd', description: 'Balanced and versatile', color: '#10B981' },
  { id: 'ash', name: 'Ash', provider: 'openai', gender: 'male', style: ['calm', 'professional'], language: 'en-US', quality: 'hd', description: 'Soft and thoughtful', color: '#6B7280' },
  { id: 'ballad', name: 'Ballad', provider: 'openai', gender: 'male', style: ['warm', 'friendly'], language: 'en-US', quality: 'hd', description: 'Warm and melodic', color: '#8B5CF6' },
  { id: 'coral', name: 'Coral', provider: 'openai', gender: 'female', style: ['warm', 'friendly'], language: 'en-US', quality: 'hd', description: 'Warm and engaging', color: '#F472B6' },
  { id: 'echo', name: 'Echo', provider: 'openai', gender: 'male', style: ['professional', 'authoritative'], language: 'en-US', quality: 'hd', description: 'Clear and confident', color: '#3B82F6' },
  { id: 'sage', name: 'Sage', provider: 'openai', gender: 'female', style: ['calm', 'professional'], language: 'en-US', quality: 'hd', description: 'Wise and reassuring', color: '#14B8A6' },
  { id: 'shimmer', name: 'Shimmer', provider: 'openai', gender: 'female', style: ['energetic', 'friendly'], language: 'en-US', quality: 'hd', description: 'Bright and expressive', color: '#F59E0B' },
  { id: 'verse', name: 'Verse', provider: 'openai', gender: 'male', style: ['professional', 'calm'], language: 'en-US', quality: 'hd', description: 'Articulate and clear', color: '#EC4899' },
];

// Deepgram Aura Voices
export const DEEPGRAM_VOICES: VoiceDefinition[] = [
  { id: 'aura-asteria-en', name: 'Asteria', provider: 'deepgram', gender: 'female', style: ['professional', 'warm'], language: 'en-US', quality: 'neural', description: 'Natural female voice', color: '#13EF93' },
  { id: 'aura-luna-en', name: 'Luna', provider: 'deepgram', gender: 'female', style: ['calm', 'friendly'], language: 'en-US', quality: 'neural', description: 'Soft and soothing', color: '#A78BFA' },
  { id: 'aura-stella-en', name: 'Stella', provider: 'deepgram', gender: 'female', style: ['energetic', 'friendly'], language: 'en-US', quality: 'neural', description: 'Bright and cheerful', color: '#F472B6' },
  { id: 'aura-athena-en', name: 'Athena', provider: 'deepgram', gender: 'female', style: ['authoritative', 'professional'], language: 'en-US', quality: 'neural', description: 'Strong and confident', color: '#60A5FA' },
  { id: 'aura-hera-en', name: 'Hera', provider: 'deepgram', gender: 'female', style: ['warm', 'professional'], language: 'en-US', quality: 'neural', description: 'Elegant and composed', color: '#C084FC' },
  { id: 'aura-orion-en', name: 'Orion', provider: 'deepgram', gender: 'male', style: ['professional', 'authoritative'], language: 'en-US', quality: 'neural', description: 'Deep and commanding', color: '#2563EB' },
  { id: 'aura-arcas-en', name: 'Arcas', provider: 'deepgram', gender: 'male', style: ['calm', 'professional'], language: 'en-US', quality: 'neural', description: 'Steady and reliable', color: '#0891B2' },
  { id: 'aura-perseus-en', name: 'Perseus', provider: 'deepgram', gender: 'male', style: ['energetic', 'friendly'], language: 'en-US', quality: 'neural', description: 'Dynamic and engaging', color: '#059669' },
  { id: 'aura-angus-en', name: 'Angus', provider: 'deepgram', gender: 'male', style: ['warm', 'friendly'], language: 'en-US', quality: 'neural', description: 'Friendly and approachable', color: '#DC2626' },
  { id: 'aura-orpheus-en', name: 'Orpheus', provider: 'deepgram', gender: 'male', style: ['calm', 'warm'], language: 'en-US', quality: 'neural', description: 'Melodic and soothing', color: '#7C3AED' },
  { id: 'aura-helios-en', name: 'Helios', provider: 'deepgram', gender: 'male', style: ['energetic', 'authoritative'], language: 'en-US', quality: 'neural', description: 'Bright and powerful', color: '#F59E0B' },
  { id: 'aura-2-thalia-en', name: 'Thalia (Aura 2)', provider: 'deepgram', gender: 'female', style: ['professional', 'friendly'], language: 'en-US', quality: 'neural', description: 'Next-gen natural voice', color: '#10B981' },
];

// Google Gemini Live Voices
export const GOOGLE_VOICES: VoiceDefinition[] = [
  { id: 'Aoede', name: 'Aoede', provider: 'google', gender: 'female', style: ['warm', 'friendly'], language: 'en-US', quality: 'neural', description: 'Warm and melodic', color: '#4285F4' },
  { id: 'Kore', name: 'Kore', provider: 'google', gender: 'female', style: ['calm', 'professional'], language: 'en-US', quality: 'neural', description: 'Youthful and clear', color: '#34A853' },
  { id: 'Leda', name: 'Leda', provider: 'google', gender: 'female', style: ['professional', 'authoritative'], language: 'en-US', quality: 'neural', description: 'Elegant and refined', color: '#EA4335' },
  { id: 'Puck', name: 'Puck', provider: 'google', gender: 'male', style: ['energetic', 'friendly'], language: 'en-US', quality: 'neural', description: 'Playful and lively', color: '#FBBC05' },
  { id: 'Charon', name: 'Charon', provider: 'google', gender: 'male', style: ['calm', 'authoritative'], language: 'en-US', quality: 'neural', description: 'Deep and mysterious', color: '#5F6368' },
  { id: 'Fenrir', name: 'Fenrir', provider: 'google', gender: 'male', style: ['authoritative', 'professional'], language: 'en-US', quality: 'neural', description: 'Strong and commanding', color: '#1A73E8' },
  { id: 'Orus', name: 'Orus', provider: 'google', gender: 'male', style: ['warm', 'professional'], language: 'en-US', quality: 'neural', description: 'Wise and trustworthy', color: '#137333' },
  { id: 'Zephyr', name: 'Zephyr', provider: 'google', gender: 'male', style: ['calm', 'friendly'], language: 'en-US', quality: 'neural', description: 'Gentle and breezy', color: '#00ACC1' },
];

// Piper Local TTS Voice Models
export const PIPER_VOICES: VoiceDefinition[] = [
  { id: 'en_US-lessac-medium', name: 'Lessac (Medium)', provider: 'piper', gender: 'male', style: ['professional', 'calm'], language: 'en-US', quality: 'standard', description: 'Clear American English', color: '#6366F1' },
  { id: 'en_US-lessac-high', name: 'Lessac (High)', provider: 'piper', gender: 'male', style: ['professional', 'calm'], language: 'en-US', quality: 'hd', description: 'High-quality American English', color: '#8B5CF6' },
  { id: 'en_US-libritts-high', name: 'LibriTTS (High)', provider: 'piper', gender: 'neutral', style: ['professional'], language: 'en-US', quality: 'hd', description: 'Multi-speaker English', color: '#A78BFA' },
  { id: 'en_US-amy-medium', name: 'Amy', provider: 'piper', gender: 'female', style: ['warm', 'friendly'], language: 'en-US', quality: 'standard', description: 'Friendly American female', color: '#EC4899' },
  { id: 'en_US-ryan-medium', name: 'Ryan', provider: 'piper', gender: 'male', style: ['professional', 'authoritative'], language: 'en-US', quality: 'standard', description: 'Clear American male', color: '#3B82F6' },
  { id: 'en_GB-alba-medium', name: 'Alba', provider: 'piper', gender: 'female', style: ['professional', 'calm'], language: 'en-GB', quality: 'standard', description: 'British English female', color: '#14B8A6' },
  { id: 'en_GB-cori-medium', name: 'Cori', provider: 'piper', gender: 'female', style: ['warm', 'friendly'], language: 'en-GB', quality: 'standard', description: 'Warm British female', color: '#F472B6' },
  { id: 'es_ES-davefx-medium', name: 'DaveFX', provider: 'piper', gender: 'male', style: ['professional'], language: 'es-ES', quality: 'standard', description: 'Spanish male', color: '#F59E0B' },
  { id: 'fr_FR-siwis-medium', name: 'Siwis', provider: 'piper', gender: 'female', style: ['professional', 'calm'], language: 'fr-FR', quality: 'standard', description: 'French female', color: '#EF4444' },
  { id: 'de_DE-thorsten-medium', name: 'Thorsten', provider: 'piper', gender: 'male', style: ['professional'], language: 'de-DE', quality: 'standard', description: 'German male', color: '#10B981' },
];

// Kokoro Local TTS Voices
export const KOKORO_VOICES: VoiceDefinition[] = [
  { id: 'af_heart', name: 'Heart', provider: 'kokoro', gender: 'female', style: ['warm', 'friendly'], language: 'en-US', quality: 'standard', description: 'Warm and expressive', color: '#EC4899' },
  { id: 'af_bella', name: 'Bella', provider: 'kokoro', gender: 'female', style: ['professional', 'calm'], language: 'en-US', quality: 'standard', description: 'Clear and professional', color: '#F472B6' },
  { id: 'af_sarah', name: 'Sarah', provider: 'kokoro', gender: 'female', style: ['friendly', 'energetic'], language: 'en-US', quality: 'standard', description: 'Bright and cheerful', color: '#A78BFA' },
  { id: 'am_adam', name: 'Adam', provider: 'kokoro', gender: 'male', style: ['professional', 'authoritative'], language: 'en-US', quality: 'standard', description: 'Strong and clear', color: '#3B82F6' },
  { id: 'am_michael', name: 'Michael', provider: 'kokoro', gender: 'male', style: ['warm', 'friendly'], language: 'en-US', quality: 'standard', description: 'Friendly and approachable', color: '#10B981' },
];

// All voices grouped by provider
export const ALL_VOICES = {
  openai: OPENAI_VOICES,
  deepgram: DEEPGRAM_VOICES,
  google: GOOGLE_VOICES,
  piper: PIPER_VOICES,
  kokoro: KOKORO_VOICES,
};

// Get voice by ID across all providers
export function getVoiceById(id: string): VoiceDefinition | undefined {
  for (const voices of Object.values(ALL_VOICES)) {
    const voice = voices.find(v => v.id === id);
    if (voice) return voice;
  }
  return undefined;
}

// Get voices by provider
export function getVoicesByProvider(provider: string): VoiceDefinition[] {
  return ALL_VOICES[provider as keyof typeof ALL_VOICES] || [];
}

// Get voices by gender
export function getVoicesByGender(gender: VoiceGender): VoiceDefinition[] {
  return Object.values(ALL_VOICES).flat().filter(v => v.gender === gender);
}

// Get voices by language
export function getVoicesByLanguage(language: string): VoiceDefinition[] {
  return Object.values(ALL_VOICES).flat().filter(v => v.language === language);
}
