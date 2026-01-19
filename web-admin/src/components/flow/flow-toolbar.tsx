'use client';

import { DragEvent } from 'react';
import {
  PlayCircle,
  Sparkles,
  Ear,
  GitBranch,
  PhoneForwarded,
  Code,
  ClipboardList,
  Volume2,
  PhoneOff,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { NodeType } from '@/types/flow';

interface NodeTypeItem {
  type: NodeType;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  category: 'entry' | 'conversation' | 'routing' | 'action' | 'exit';
}

const nodeTypes: NodeTypeItem[] = [
  {
    type: 'start',
    label: 'Start',
    description: 'Entry point with greeting',
    icon: <PlayCircle className="h-5 w-5" />,
    color: '#22c55e',
    category: 'entry',
  },
  {
    type: 'aiResponse',
    label: 'AI Response',
    description: 'Generate AI-powered response',
    icon: <Sparkles className="h-5 w-5" />,
    color: '#8b5cf6',
    category: 'conversation',
  },
  {
    type: 'listen',
    label: 'Listen',
    description: 'Wait for user input',
    icon: <Ear className="h-5 w-5" />,
    color: '#3b82f6',
    category: 'conversation',
  },
  {
    type: 'branch',
    label: 'Branch',
    description: 'Route based on conditions',
    icon: <GitBranch className="h-5 w-5" />,
    color: '#f59e0b',
    category: 'routing',
  },
  {
    type: 'transfer',
    label: 'Transfer',
    description: 'Transfer call',
    icon: <PhoneForwarded className="h-5 w-5" />,
    color: '#06b6d4',
    category: 'action',
  },
  {
    type: 'function',
    label: 'Function',
    description: 'Call API or execute action',
    icon: <Code className="h-5 w-5" />,
    color: '#ec4899',
    category: 'action',
  },
  {
    type: 'collectInfo',
    label: 'Collect',
    description: 'Gather structured data',
    icon: <ClipboardList className="h-5 w-5" />,
    color: '#14b8a6',
    category: 'conversation',
  },
  {
    type: 'playAudio',
    label: 'Audio',
    description: 'Play a prompt file',
    icon: <Volume2 className="h-5 w-5" />,
    color: '#6366f1',
    category: 'action',
  },
  {
    type: 'end',
    label: 'End',
    description: 'End the call',
    icon: <PhoneOff className="h-5 w-5" />,
    color: '#ef4444',
    category: 'exit',
  },
];

function DraggableNode({ node }: { node: NodeTypeItem }) {
  const onDragStart = (event: DragEvent, nodeType: NodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'w-12 h-12 rounded-lg flex flex-col items-center justify-center cursor-grab',
              'hover:scale-105 transition-transform',
              'border-2 border-transparent hover:border-primary/50',
              'bg-background shadow-sm'
            )}
            style={{
              backgroundColor: `${node.color}15`,
              borderColor: `${node.color}30`,
            }}
            draggable
            onDragStart={(e) => onDragStart(e, node.type)}
          >
            <div style={{ color: node.color }}>
              {node.icon}
            </div>
            <span className="text-[9px] font-medium mt-0.5 text-muted-foreground">
              {node.label}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p className="font-medium">{node.label}</p>
          <p className="text-xs text-muted-foreground">{node.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function FlowToolbar() {
  const categories = [
    { id: 'entry', label: 'Entry' },
    { id: 'conversation', label: 'Conversation' },
    { id: 'routing', label: 'Routing' },
    { id: 'action', label: 'Actions' },
    { id: 'exit', label: 'Exit' },
  ];

  return (
    <div className="w-16 border-r bg-muted/30 flex flex-col py-2 px-1.5 gap-1 overflow-y-auto">
      {categories.map((category) => {
        const categoryNodes = nodeTypes.filter((n) => n.category === category.id);
        if (categoryNodes.length === 0) return null;

        return (
          <div key={category.id} className="space-y-1">
            <div className="text-[8px] uppercase tracking-wider text-muted-foreground text-center font-semibold px-1 py-1">
              {category.label}
            </div>
            {categoryNodes.map((node) => (
              <DraggableNode key={node.type} node={node} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
