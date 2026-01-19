'use client';

import { memo } from 'react';
import { NodeProps } from 'reactflow';
import { PlayCircle } from 'lucide-react';
import { BaseNode } from './base-node';
import type { StartNodeData } from '@/types/flow';

export const StartNode = memo(function StartNode(props: NodeProps<StartNodeData>) {
  const { data } = props;

  return (
    <BaseNode
      {...props}
      icon={<PlayCircle className="h-4 w-4" />}
      color="#22c55e"
      inputs={0}
      outputs={1}
    >
      <div className="max-w-[140px] truncate">
        {data.greetingType === 'text' ? (
          <span className="italic">"{data.greetingText?.slice(0, 30)}..."</span>
        ) : (
          <span>Audio prompt</span>
        )}
      </div>
    </BaseNode>
  );
});

export default StartNode;
