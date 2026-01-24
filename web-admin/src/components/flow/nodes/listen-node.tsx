'use client';

import { memo } from 'react';
import { NodeProps } from 'reactflow';
import { Ear } from 'lucide-react';
import { BaseNode } from './base-node';
import type { ListenNodeData } from '@/types/flow';

export const ListenNode = memo(function ListenNode(props: NodeProps<ListenNodeData>) {
  const { data } = props;

  const outputs = [
    { id: 'default', label: 'Input' },
    { id: 'timeout', label: 'Timeout' },
  ];

  return (
    <BaseNode
      {...props}
      icon={<Ear className="h-4 w-4" />}
      color="#3b82f6"
      inputs={1}
      outputs={outputs}
    >
      <div className="space-y-1">
        <div>
          Store as: <code className="bg-muted px-1 rounded">{data.storeAs}</code>
        </div>
        <div className="text-[10px] text-muted-foreground">
          Timeout: {data.timeout}s
        </div>
      </div>
    </BaseNode>
  );
});

export default ListenNode;
