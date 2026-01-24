'use client';

import { memo } from 'react';
import { NodeProps } from 'reactflow';
import { Sparkles } from 'lucide-react';
import { BaseNode } from './base-node';
import { Badge } from '@/components/ui/badge';
import type { AIResponseNodeData } from '@/types/flow';

export const AIResponseNode = memo(function AIResponseNode(props: NodeProps<AIResponseNodeData>) {
  const { data } = props;

  return (
    <BaseNode
      {...props}
      icon={<Sparkles className="h-4 w-4" />}
      color="#8b5cf6"
      inputs={1}
      outputs={1}
    >
      <div className="space-y-1">
        <Badge variant="outline" className="text-[10px]">
          {data.promptType === 'dynamic' ? 'Dynamic' : 'Fixed'}
        </Badge>
        {data.storeResultAs && (
          <div className="text-[10px] text-muted-foreground">
            Store as: <code className="bg-muted px-1 rounded">{data.storeResultAs}</code>
          </div>
        )}
      </div>
    </BaseNode>
  );
});

export default AIResponseNode;
