'use client';

import { memo } from 'react';
import { NodeProps } from 'reactflow';
import { PhoneOff } from 'lucide-react';
import { BaseNode } from './base-node';
import { Badge } from '@/components/ui/badge';
import type { EndNodeData } from '@/types/flow';

export const EndNode = memo(function EndNode(props: NodeProps<EndNodeData>) {
  const { data } = props;

  const outcomeColors: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    transferred: 'bg-blue-100 text-blue-700',
    abandoned: 'bg-yellow-100 text-yellow-700',
    error: 'bg-red-100 text-red-700',
  };

  return (
    <BaseNode
      {...props}
      icon={<PhoneOff className="h-4 w-4" />}
      color="#ef4444"
      inputs={1}
      outputs={0}
    >
      <div className="space-y-1">
        <Badge className={`text-[10px] ${outcomeColors[data.outcome] || ''}`}>
          {data.outcome}
        </Badge>
        {data.goodbyeType !== 'none' && data.goodbyeMessage && (
          <div className="text-[10px] truncate max-w-[120px] italic">
            "{data.goodbyeMessage.slice(0, 20)}..."
          </div>
        )}
      </div>
    </BaseNode>
  );
});

export default EndNode;
