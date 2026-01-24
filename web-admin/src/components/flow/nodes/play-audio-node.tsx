'use client';

import { memo } from 'react';
import { NodeProps } from 'reactflow';
import { Volume2 } from 'lucide-react';
import { BaseNode } from './base-node';
import { Badge } from '@/components/ui/badge';
import type { PlayAudioNodeData } from '@/types/flow';

export const PlayAudioNode = memo(function PlayAudioNode(props: NodeProps<PlayAudioNodeData>) {
  const { data } = props;

  const outputs = [
    { id: 'complete', label: 'Complete' },
    { id: 'interrupted', label: 'Interrupted' },
  ];

  const sourceLabels = {
    tts: 'TTS',
    prompt: 'Prompt',
    url: 'URL',
  };

  return (
    <BaseNode
      {...props}
      icon={<Volume2 className="h-4 w-4" />}
      color="#6366f1"
      inputs={1}
      outputs={outputs}
    >
      <div className="space-y-1">
        <Badge variant="outline" className="text-[10px]">
          {sourceLabels[data.source]}
        </Badge>
        {data.source === 'tts' && data.ttsText && (
          <div className="text-[10px] truncate max-w-[120px] italic">
            "{data.ttsText.slice(0, 20)}..."
          </div>
        )}
        <div className="flex gap-1">
          {data.interruptible && (
            <Badge variant="secondary" className="text-[8px] px-1">
              Barge-in
            </Badge>
          )}
          {data.dtmfEnabled && (
            <Badge variant="secondary" className="text-[8px] px-1">
              DTMF
            </Badge>
          )}
        </div>
      </div>
    </BaseNode>
  );
});

export default PlayAudioNode;
