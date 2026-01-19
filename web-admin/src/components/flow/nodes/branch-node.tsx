'use client';

import { memo, useMemo } from 'react';
import { NodeProps } from 'reactflow';
import { GitBranch } from 'lucide-react';
import { BaseNode } from './base-node';
import { Badge } from '@/components/ui/badge';
import type { BranchNodeData } from '@/types/flow';

export const BranchNode = memo(function BranchNode(props: NodeProps<BranchNodeData>) {
  const { data } = props;

  const outputs = useMemo(() => {
    const outs: { id: string; label: string }[] = [];

    if (data.conditionType === 'intent' && data.intents) {
      data.intents.forEach((intent, i) => {
        outs.push({ id: `intent-${i}`, label: intent.name });
      });
    } else if (data.conditionType === 'keyword' && data.keywords) {
      data.keywords.forEach((kw, i) => {
        outs.push({ id: `keyword-${i}`, label: kw.words.join(', ').slice(0, 10) });
      });
    } else if (data.conditionType === 'variable' && data.variableConditions) {
      data.variableConditions.forEach((vc, i) => {
        outs.push({ id: `var-${i}`, label: vc.variable });
      });
    } else if (data.conditionType === 'ai_classification' && data.classificationOptions) {
      data.classificationOptions.forEach((opt, i) => {
        outs.push({ id: `class-${i}`, label: opt.label });
      });
    }

    // Always add default
    outs.push({ id: 'default', label: data.defaultOutput || 'default' });

    return outs;
  }, [data]);

  const conditionLabel = {
    intent: 'Intent',
    keyword: 'Keyword',
    variable: 'Variable',
    ai_classification: 'AI Class',
  }[data.conditionType];

  return (
    <BaseNode
      {...props}
      icon={<GitBranch className="h-4 w-4" />}
      color="#f59e0b"
      inputs={1}
      outputs={outputs}
    >
      <div className="space-y-1">
        <Badge variant="outline" className="text-[10px]">
          {conditionLabel}
        </Badge>
        <div className="text-[10px] text-muted-foreground">
          {outputs.length} outputs
        </div>
      </div>
    </BaseNode>
  );
});

export default BranchNode;
