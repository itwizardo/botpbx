'use client';

import { memo } from 'react';
import { NodeProps } from 'reactflow';
import { ClipboardList } from 'lucide-react';
import { BaseNode } from './base-node';
import { Badge } from '@/components/ui/badge';
import type { CollectInfoNodeData } from '@/types/flow';

export const CollectInfoNode = memo(function CollectInfoNode(props: NodeProps<CollectInfoNodeData>) {
  const { data } = props;

  const outputs = [
    { id: 'complete', label: 'Complete' },
    { id: 'cancel', label: 'Cancel' },
  ];

  return (
    <BaseNode
      {...props}
      icon={<ClipboardList className="h-4 w-4" />}
      color="#14b8a6"
      inputs={1}
      outputs={outputs}
    >
      <div className="space-y-1">
        <Badge variant="outline" className="text-[10px]">
          {data.fields?.length || 0} fields
        </Badge>
        {data.fields && data.fields.length > 0 && (
          <div className="text-[10px] text-muted-foreground">
            {data.fields.map(f => f.name).join(', ').slice(0, 20)}
            {data.fields.map(f => f.name).join(', ').length > 20 && '...'}
          </div>
        )}
        {data.confirmAll && (
          <div className="text-[10px] text-muted-foreground">
            Confirm: Yes
          </div>
        )}
      </div>
    </BaseNode>
  );
});

export default CollectInfoNode;
