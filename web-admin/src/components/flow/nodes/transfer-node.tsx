'use client';

import { memo } from 'react';
import { NodeProps } from 'reactflow';
import { PhoneForwarded } from 'lucide-react';
import { BaseNode } from './base-node';
import { Badge } from '@/components/ui/badge';
import type { TransferNodeData } from '@/types/flow';

export const TransferNode = memo(function TransferNode(props: NodeProps<TransferNodeData>) {
  const { data } = props;

  const outputs = [
    { id: 'success', label: 'Success' },
    { id: 'failure', label: 'Failure' },
  ];

  const typeLabels = {
    extension: 'Ext',
    queue: 'Queue',
    ring_group: 'RG',
    external: 'External',
    trunk: 'Trunk',
  };

  return (
    <BaseNode
      {...props}
      icon={<PhoneForwarded className="h-4 w-4" />}
      color="#06b6d4"
      inputs={1}
      outputs={outputs}
    >
      <div className="space-y-1">
        <Badge variant="outline" className="text-[10px]">
          {typeLabels[data.transferType]}
        </Badge>
        {data.destination && (
          <div className="font-mono text-[10px]">
            {data.destination}
          </div>
        )}
      </div>
    </BaseNode>
  );
});

export default TransferNode;
