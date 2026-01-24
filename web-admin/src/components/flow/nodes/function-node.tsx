'use client';

import { memo } from 'react';
import { NodeProps } from 'reactflow';
import { Code } from 'lucide-react';
import { BaseNode } from './base-node';
import { Badge } from '@/components/ui/badge';
import type { FunctionNodeData } from '@/types/flow';

export const FunctionNode = memo(function FunctionNode(props: NodeProps<FunctionNodeData>) {
  const { data } = props;

  const outputs = [
    { id: 'success', label: 'Success' },
    { id: 'error', label: 'Error' },
  ];

  const builtinLabels: Record<string, string> = {
    lookup_customer: 'Lookup',
    check_hours: 'Hours',
    send_sms: 'SMS',
    schedule_callback: 'Callback',
  };

  return (
    <BaseNode
      {...props}
      icon={<Code className="h-4 w-4" />}
      color="#ec4899"
      inputs={1}
      outputs={outputs}
    >
      <div className="space-y-1">
        <Badge variant="outline" className="text-[10px]">
          {data.functionType === 'builtin'
            ? builtinLabels[data.builtinFunction || ''] || 'Built-in'
            : 'Webhook'}
        </Badge>
        {data.functionType === 'webhook' && data.webhookUrl && (
          <div className="text-[10px] truncate max-w-[120px]">
            {data.webhookMethod || 'POST'}
          </div>
        )}
        {data.storeResultAs && (
          <div className="text-[10px] text-muted-foreground">
            Store as: <code className="bg-muted px-1 rounded">{data.storeResultAs}</code>
          </div>
        )}
      </div>
    </BaseNode>
  );
});

export default FunctionNode;
