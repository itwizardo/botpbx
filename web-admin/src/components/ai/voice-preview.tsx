"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { voicePreviewApi, VoiceInfo } from "@/lib/api";
import {
  Play,
  Pause,
  Square,
  Loader2,
  Volume2,
  Check,
  RefreshCw,
} from "lucide-react";

interface VoicePreviewProps {
  selectedVoice: string;
  onVoiceSelect: (voice: string) => void;
  compact?: boolean;
}

const VOICE_DATA: Record<string, { icon: string; color: string }> = {
  alloy: { icon: "circle", color: "bg-slate-500" },
  ash: { icon: "circle", color: "bg-stone-500" },
  ballad: { icon: "circle", color: "bg-amber-500" },
  coral: { icon: "circle", color: "bg-pink-500" },
  echo: { icon: "circle", color: "bg-blue-500" },
  sage: { icon: "circle", color: "bg-emerald-500" },
  shimmer: { icon: "circle", color: "bg-purple-500" },
  verse: { icon: "circle", color: "bg-indigo-500" },
};

export function VoicePreview({
  selectedVoice,
  onVoiceSelect,
  compact = false,
}: VoicePreviewProps) {
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [generatingVoice, setGeneratingVoice] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");
  const [audioCache, setAudioCache] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load voices on mount
  useEffect(() => {
    loadVoices();
    return () => {
      // Cleanup audio on unmount
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const loadVoices = async () => {
    try {
      setLoading(true);
      const response = await voicePreviewApi.listVoices();
      if (response.success) {
        setVoices(response.data);
      }
    } catch (err) {
      console.error("Failed to load voices:", err);
      // Fallback to hardcoded voices
      setVoices([
        { id: "alloy", name: "Alloy", description: "Neutral and balanced", gender: "neutral", style: "professional" },
        { id: "ash", name: "Ash", description: "Calm and thoughtful", gender: "neutral", style: "measured" },
        { id: "ballad", name: "Ballad", description: "Warm and melodic", gender: "neutral", style: "warm" },
        { id: "coral", name: "Coral", description: "Friendly and approachable", gender: "female", style: "casual" },
        { id: "echo", name: "Echo", description: "Clear and articulate", gender: "male", style: "professional" },
        { id: "sage", name: "Sage", description: "Wise and reassuring", gender: "neutral", style: "calm" },
        { id: "shimmer", name: "Shimmer", description: "Bright and energetic", gender: "female", style: "enthusiastic" },
        { id: "verse", name: "Verse", description: "Expressive and dynamic", gender: "neutral", style: "expressive" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const playVoice = async (voiceId: string) => {
    setError(null);

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      if (playingVoice === voiceId) {
        setPlayingVoice(null);
        return;
      }
    }

    // Check cache first
    if (audioCache[voiceId]) {
      playAudio(voiceId, audioCache[voiceId]);
      return;
    }

    // Generate preview
    try {
      setGeneratingVoice(voiceId);
      const response = await voicePreviewApi.preview(
        voiceId,
        customText || undefined
      );

      if (response.success) {
        // Cache the audio
        setAudioCache((prev) => ({ ...prev, [voiceId]: response.data.audio }));
        playAudio(voiceId, response.data.audio);
      } else {
        setError("Failed to generate preview");
      }
    } catch (err: any) {
      console.error("Failed to generate voice preview:", err);
      setError(err.message || "Failed to generate preview");
    } finally {
      setGeneratingVoice(null);
    }
  };

  const playAudio = (voiceId: string, audioData: string) => {
    const audio = new Audio(audioData);
    audioRef.current = audio;
    setPlayingVoice(voiceId);

    audio.play().catch((err) => {
      console.error("Failed to play audio:", err);
      setError("Failed to play audio");
      setPlayingVoice(null);
    });

    audio.onended = () => {
      setPlayingVoice(null);
      audioRef.current = null;
    };
  };

  const stopPlaying = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingVoice(null);
  };

  const clearCache = () => {
    setAudioCache({});
  };

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Voice</Label>
          {Object.keys(audioCache).length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearCache}
              className="h-6 text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Clear cache
            </Button>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {voices.map((voice) => (
            <button
              key={voice.id}
              onClick={() => onVoiceSelect(voice.id)}
              className={cn(
                "relative flex flex-col items-center p-3 rounded-lg border transition-all",
                selectedVoice === voice.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-primary/50 hover:bg-muted/50"
              )}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center mb-2",
                  VOICE_DATA[voice.id]?.color || "bg-gray-500"
                )}
              >
                <Volume2 className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-medium">{voice.name}</span>
              <span className="text-xs text-muted-foreground capitalize">
                {voice.gender}
              </span>

              {/* Play button overlay */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  playVoice(voice.id);
                }}
                disabled={generatingVoice === voice.id}
                className="absolute top-1 right-1 p-1 rounded-full bg-background/80 hover:bg-background border shadow-sm"
              >
                {generatingVoice === voice.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : playingVoice === voice.id ? (
                  <Square className="h-3 w-3" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
              </button>

              {/* Selected indicator */}
              {selectedVoice === voice.id && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              )}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Voice Selection</h3>
          <p className="text-sm text-muted-foreground">
            Click play to preview each voice
          </p>
        </div>
        {Object.keys(audioCache).length > 0 && (
          <Button variant="outline" size="sm" onClick={clearCache}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Clear cached previews
          </Button>
        )}
      </div>

      {/* Custom text input */}
      <div className="space-y-2">
        <Label>Custom preview text (optional)</Label>
        <Textarea
          placeholder="Enter custom text to preview with each voice..."
          value={customText}
          onChange={(e) => {
            setCustomText(e.target.value);
            clearCache(); // Clear cache when text changes
          }}
          rows={2}
          className="resize-none"
        />
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Loading voices...</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {voices.map((voice) => (
            <Card
              key={voice.id}
              className={cn(
                "p-4 cursor-pointer transition-all hover:shadow-md",
                selectedVoice === voice.id
                  ? "ring-2 ring-primary border-primary"
                  : "hover:border-primary/50"
              )}
              onClick={() => onVoiceSelect(voice.id)}
            >
              <div className="flex flex-col items-center text-center space-y-3">
                {/* Voice avatar */}
                <div
                  className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center",
                    VOICE_DATA[voice.id]?.color || "bg-gray-500"
                  )}
                >
                  <Volume2 className="h-6 w-6 text-white" />
                </div>

                {/* Voice info */}
                <div>
                  <h4 className="font-medium">{voice.name}</h4>
                  <p className="text-xs text-muted-foreground">
                    {voice.description}
                  </p>
                </div>

                {/* Tags */}
                <div className="flex gap-1 flex-wrap justify-center">
                  <Badge variant="secondary" className="text-xs">
                    {voice.gender}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {voice.style}
                  </Badge>
                </div>

                {/* Play button */}
                <Button
                  variant={playingVoice === voice.id ? "destructive" : "outline"}
                  size="sm"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    playVoice(voice.id);
                  }}
                  disabled={generatingVoice === voice.id}
                >
                  {generatingVoice === voice.id ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : playingVoice === voice.id ? (
                    <>
                      <Square className="h-4 w-4 mr-2" />
                      Stop
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Preview
                    </>
                  )}
                </Button>

                {/* Selected indicator */}
                {selectedVoice === voice.id && (
                  <div className="flex items-center text-primary text-sm">
                    <Check className="h-4 w-4 mr-1" />
                    Selected
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
