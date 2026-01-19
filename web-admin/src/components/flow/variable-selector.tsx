'use client';

import { useState } from 'react';
import { Variable, ChevronDown, Search, Phone, User, Clock, Hash, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import type { FlowNode, CollectInfoNodeData, ListenNodeData, FunctionNodeData } from '@/types/flow';

interface VariableSelectorProps {
  nodes: FlowNode[];
  currentNodeId: string;
  onSelect: (variableName: string) => void;
}

interface AvailableVariable {
  name: string;
  source: string;
  type: 'system' | 'listen' | 'collect' | 'function' | 'custom';
  description?: string;
}

// System variables always available
const SYSTEM_VARIABLES: AvailableVariable[] = [
  { name: 'caller_id', source: 'System', type: 'system', description: "Caller's phone number" },
  { name: 'caller_name', source: 'System', type: 'system', description: "Caller's name (if available)" },
  { name: 'call_time', source: 'System', type: 'system', description: 'Call start time' },
  { name: 'agent_name', source: 'System', type: 'system', description: 'AI Agent name' },
  { name: 'conversation_id', source: 'System', type: 'system', description: 'Unique conversation ID' },
  { name: 'last_user_input', source: 'System', type: 'system', description: "Last thing the user said" },
];

function getIconForType(type: AvailableVariable['type']) {
  switch (type) {
    case 'system':
      return <Hash className="h-3 w-3" />;
    case 'listen':
      return <MessageSquare className="h-3 w-3" />;
    case 'collect':
      return <User className="h-3 w-3" />;
    case 'function':
      return <Variable className="h-3 w-3" />;
    default:
      return <Variable className="h-3 w-3" />;
  }
}

function getColorForType(type: AvailableVariable['type']) {
  switch (type) {
    case 'system':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'listen':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'collect':
      return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'function':
      return 'bg-orange-100 text-orange-700 border-orange-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

export function VariableSelector({ nodes, currentNodeId, onSelect }: VariableSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Get variables available at the current node position
  const getAvailableVariables = (): AvailableVariable[] => {
    const variables: AvailableVariable[] = [...SYSTEM_VARIABLES];

    // Find the path to current node by traversing the flow
    // For simplicity, we'll include all variables from all nodes that come before current node
    // In a real implementation, you'd trace the actual path through edges

    for (const node of nodes) {
      // Skip nodes after current (by id order - simplified)
      if (node.id === currentNodeId) continue;

      switch (node.type) {
        case 'listen': {
          const data = node.data as ListenNodeData;
          if (data.storeAs) {
            variables.push({
              name: data.storeAs,
              source: `Listen: ${data.label || node.id}`,
              type: 'listen',
              description: 'User input from listen node',
            });
          }
          break;
        }

        case 'collectInfo': {
          const data = node.data as CollectInfoNodeData;
          if (data.fields) {
            for (const field of data.fields) {
              variables.push({
                name: field.name,
                source: `Collect: ${data.label || node.id}`,
                type: 'collect',
                description: `${field.type} field: ${field.prompt.substring(0, 30)}...`,
              });
            }
          }
          break;
        }

        case 'function': {
          const data = node.data as FunctionNodeData;
          if (data.storeResultAs) {
            variables.push({
              name: data.storeResultAs,
              source: `Function: ${data.label || node.id}`,
              type: 'function',
              description: 'Result from function/webhook',
            });
          }
          if (data.responseMapping) {
            for (const mapping of data.responseMapping) {
              variables.push({
                name: mapping.variable,
                source: `Function: ${data.label || node.id}`,
                type: 'function',
                description: `Mapped from ${mapping.path}`,
              });
            }
          }
          break;
        }

        case 'aiResponse': {
          const data = node.data as any;
          if (data.storeResultAs) {
            variables.push({
              name: data.storeResultAs,
              source: `AI Response: ${data.label || node.id}`,
              type: 'custom',
              description: 'AI generated response',
            });
          }
          break;
        }
      }
    }

    return variables;
  };

  const variables = getAvailableVariables();
  const filteredVariables = search
    ? variables.filter(
        v =>
          v.name.toLowerCase().includes(search.toLowerCase()) ||
          v.source.toLowerCase().includes(search.toLowerCase())
      )
    : variables;

  const handleSelect = (variable: AvailableVariable) => {
    onSelect(`{{${variable.name}}}`);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs gap-1"
        >
          <Variable className="h-3 w-3" />
          Insert Variable
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search variables..."
              className="h-8 pl-7 text-sm"
            />
          </div>
        </div>
        <ScrollArea className="h-64">
          <div className="p-2 space-y-1">
            {filteredVariables.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-4">
                No variables found
              </div>
            ) : (
              filteredVariables.map((variable, index) => (
                <button
                  key={index}
                  onClick={() => handleSelect(variable)}
                  className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`${getColorForType(variable.type)} text-[10px] px-1.5 py-0`}
                    >
                      {getIconForType(variable.type)}
                    </Badge>
                    <span className="font-mono text-sm font-medium">
                      {`{{${variable.name}}}`}
                    </span>
                  </div>
                  <div className="ml-6 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {variable.source}
                    </span>
                    {variable.description && (
                      <p className="text-xs text-muted-foreground/70 truncate">
                        {variable.description}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
        <div className="p-2 border-t bg-muted/30">
          <p className="text-[10px] text-muted-foreground">
            Click a variable to insert it. Variables are replaced with actual values during execution.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Helper component for text inputs with variable insertion
interface VariableTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  nodes: FlowNode[];
  currentNodeId: string;
  label?: string;
}

export function VariableTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  nodes,
  currentNodeId,
  label,
}: VariableTextareaProps) {
  const handleInsertVariable = (variableText: string) => {
    // Insert at cursor position or append
    onChange(value + variableText);
  };

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">{label}</label>
          <VariableSelector
            nodes={nodes}
            currentNodeId={currentNodeId}
            onSelect={handleInsertVariable}
          />
        </div>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}
