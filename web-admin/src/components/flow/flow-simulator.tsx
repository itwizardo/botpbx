'use client';

import { useState, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Send,
  MessageSquare,
  Bot,
  User,
  Variable,
  Clock,
  CheckCircle,
  XCircle,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import type {
  FlowData,
  FlowNode,
  FlowEdge,
  StartNodeData,
  AIResponseNodeData,
  ListenNodeData,
  BranchNodeData,
  EndNodeData,
} from '@/types/flow';

interface FlowSimulatorProps {
  flowData: FlowData;
  onNodeHighlight: (nodeId: string | null) => void;
}

interface SimulationState {
  status: 'idle' | 'running' | 'waiting_input' | 'completed' | 'error';
  currentNodeId: string | null;
  variables: Record<string, unknown>;
  history: SimulationHistoryEntry[];
  error?: string;
}

interface SimulationHistoryEntry {
  timestamp: number;
  type: 'system' | 'ai' | 'user' | 'action' | 'branch';
  nodeId?: string;
  nodeName?: string;
  message: string;
  details?: string;
}

export function FlowSimulator({ flowData, onNodeHighlight }: FlowSimulatorProps) {
  const [state, setState] = useState<SimulationState>({
    status: 'idle',
    currentNodeId: null,
    variables: {},
    history: [],
  });
  const [userInput, setUserInput] = useState('');

  // Find node by ID
  const findNode = useCallback(
    (nodeId: string): FlowNode | undefined => {
      return flowData.nodes.find((n) => n.id === nodeId);
    },
    [flowData.nodes]
  );

  // Find next node following an edge
  const findNextNode = useCallback(
    (currentNodeId: string, outputHandle?: string): FlowNode | undefined => {
      const edge = flowData.edges.find(
        (e) =>
          e.source === currentNodeId &&
          (outputHandle ? e.sourceHandle === outputHandle : true)
      );
      if (!edge) return undefined;
      return findNode(edge.target);
    },
    [flowData.edges, findNode]
  );

  // Add history entry
  const addHistory = useCallback(
    (entry: Omit<SimulationHistoryEntry, 'timestamp'>) => {
      setState((prev) => ({
        ...prev,
        history: [...prev.history, { ...entry, timestamp: Date.now() }],
      }));
    },
    []
  );

  // Set variable
  const setVariable = useCallback((key: string, value: unknown) => {
    setState((prev) => ({
      ...prev,
      variables: { ...prev.variables, [key]: value },
    }));
  }, []);

  // Interpolate variables in text
  const interpolate = useCallback(
    (text: string): string => {
      return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
        const value = state.variables[varName];
        return value !== undefined ? String(value) : match;
      });
    },
    [state.variables]
  );

  // Execute a node
  const executeNode = useCallback(
    async (node: FlowNode): Promise<{ nextNodeId?: string; waitForInput?: boolean }> => {
      const data = node.data;

      switch (node.type) {
        case 'start': {
          const startData = data as StartNodeData;
          const greeting = interpolate(startData.greetingText);
          addHistory({
            type: 'ai',
            nodeId: node.id,
            nodeName: startData.label,
            message: greeting,
          });
          const nextNode = findNextNode(node.id);
          return { nextNodeId: nextNode?.id };
        }

        case 'aiResponse': {
          const aiData = data as AIResponseNodeData;
          const response =
            aiData.promptType === 'fixed' && aiData.fixedResponse
              ? interpolate(aiData.fixedResponse)
              : `[AI would generate response based on: ${aiData.instruction || 'default behavior'}]`;

          if (aiData.storeResultAs) {
            setVariable(aiData.storeResultAs, response);
          }

          addHistory({
            type: 'ai',
            nodeId: node.id,
            nodeName: aiData.label,
            message: response,
          });
          const nextNode = findNextNode(node.id);
          return { nextNodeId: nextNode?.id };
        }

        case 'listen': {
          const listenData = data as ListenNodeData;
          addHistory({
            type: 'system',
            nodeId: node.id,
            nodeName: listenData.label,
            message: `Waiting for user input (timeout: ${listenData.timeout}s)`,
            details: `Will store in: ${listenData.storeAs}`,
          });
          return { waitForInput: true };
        }

        case 'branch': {
          const branchData = data as BranchNodeData;
          addHistory({
            type: 'branch',
            nodeId: node.id,
            nodeName: branchData.label,
            message: `Evaluating ${branchData.conditionType} conditions`,
          });
          // In simulation, go to default output
          const nextNode = findNextNode(node.id, branchData.defaultOutput);
          addHistory({
            type: 'action',
            nodeId: node.id,
            message: `Branch selected: ${branchData.defaultOutput}`,
          });
          return { nextNodeId: nextNode?.id };
        }

        case 'transfer': {
          addHistory({
            type: 'action',
            nodeId: node.id,
            nodeName: (data as any).label,
            message: `Transfer to ${(data as any).destination}`,
            details: `Type: ${(data as any).transferType}`,
          });
          const nextNode = findNextNode(node.id);
          return { nextNodeId: nextNode?.id };
        }

        case 'function': {
          addHistory({
            type: 'action',
            nodeId: node.id,
            nodeName: (data as any).label,
            message: `Execute function: ${(data as any).functionType}`,
            details: (data as any).webhookUrl || (data as any).builtinFunction,
          });
          if ((data as any).storeResultAs) {
            setVariable((data as any).storeResultAs, { simulated: true });
          }
          const nextNode = findNextNode(node.id);
          return { nextNodeId: nextNode?.id };
        }

        case 'collectInfo': {
          addHistory({
            type: 'system',
            nodeId: node.id,
            nodeName: (data as any).label,
            message: `Collecting ${(data as any).fields?.length || 0} fields`,
          });
          // Simulate collecting all fields
          for (const field of (data as any).fields || []) {
            setVariable(field.name, `[simulated ${field.type}]`);
          }
          const nextNode = findNextNode(node.id);
          return { nextNodeId: nextNode?.id };
        }

        case 'playAudio': {
          const text =
            (data as any).source === 'tts'
              ? interpolate((data as any).ttsText || '')
              : `[Playing audio: ${(data as any).source}]`;
          addHistory({
            type: 'ai',
            nodeId: node.id,
            nodeName: (data as any).label,
            message: text,
          });
          const nextNode = findNextNode(node.id);
          return { nextNodeId: nextNode?.id };
        }

        case 'end': {
          const endData = data as EndNodeData;
          if (endData.goodbyeType === 'text' && endData.goodbyeMessage) {
            addHistory({
              type: 'ai',
              nodeId: node.id,
              nodeName: endData.label,
              message: interpolate(endData.goodbyeMessage),
            });
          }
          addHistory({
            type: 'system',
            nodeId: node.id,
            message: `Call ended: ${endData.outcome}`,
          });
          return {};
        }

        default:
          return {};
      }
    },
    [addHistory, findNextNode, interpolate, setVariable]
  );

  // Start simulation
  const startSimulation = useCallback(async () => {
    const startNode = flowData.nodes.find((n) => n.type === 'start');
    if (!startNode) {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: 'No start node found',
      }));
      return;
    }

    setState({
      status: 'running',
      currentNodeId: startNode.id,
      variables: {
        caller_id: '+1234567890',
        caller_name: 'Test Caller',
        call_time: new Date().toISOString(),
        agent_name: 'AI Agent',
        conversation_id: 'sim-' + Date.now(),
      },
      history: [
        {
          timestamp: Date.now(),
          type: 'system',
          message: 'Simulation started',
        },
      ],
    });

    onNodeHighlight(startNode.id);

    // Execute start node
    const result = await executeNode(startNode);
    if (result.nextNodeId) {
      await continueSimulation(result.nextNodeId);
    }
  }, [flowData.nodes, executeNode, onNodeHighlight]);

  // Continue simulation to next node
  const continueSimulation = useCallback(
    async (nodeId: string) => {
      const node = findNode(nodeId);
      if (!node) {
        setState((prev) => ({
          ...prev,
          status: 'completed',
        }));
        onNodeHighlight(null);
        return;
      }

      setState((prev) => ({ ...prev, currentNodeId: nodeId }));
      onNodeHighlight(nodeId);

      const result = await executeNode(node);

      if (result.waitForInput) {
        setState((prev) => ({ ...prev, status: 'waiting_input' }));
      } else if (result.nextNodeId) {
        // Add small delay for visual feedback
        setTimeout(() => continueSimulation(result.nextNodeId!), 500);
      } else {
        setState((prev) => ({ ...prev, status: 'completed' }));
        onNodeHighlight(null);
      }
    },
    [findNode, executeNode, onNodeHighlight]
  );

  // Handle user input
  const handleUserInput = useCallback(() => {
    if (!userInput.trim() || !state.currentNodeId) return;

    const node = findNode(state.currentNodeId);
    if (!node || node.type !== 'listen') return;

    const listenData = node.data as ListenNodeData;

    // Store the input
    setVariable(listenData.storeAs, userInput);
    setVariable('last_user_input', userInput);

    addHistory({
      type: 'user',
      nodeId: node.id,
      message: userInput,
    });

    setUserInput('');

    // Continue to next node
    const nextNode = findNextNode(node.id);
    if (nextNode) {
      setState((prev) => ({ ...prev, status: 'running' }));
      setTimeout(() => continueSimulation(nextNode.id), 300);
    } else {
      setState((prev) => ({ ...prev, status: 'completed' }));
      onNodeHighlight(null);
    }
  }, [
    userInput,
    state.currentNodeId,
    findNode,
    setVariable,
    addHistory,
    findNextNode,
    continueSimulation,
    onNodeHighlight,
  ]);

  // Reset simulation
  const resetSimulation = useCallback(() => {
    setState({
      status: 'idle',
      currentNodeId: null,
      variables: {},
      history: [],
    });
    setUserInput('');
    onNodeHighlight(null);
  }, [onNodeHighlight]);

  // Step to next node manually
  const stepForward = useCallback(() => {
    if (state.status !== 'waiting_input' || !state.currentNodeId) return;

    const node = findNode(state.currentNodeId);
    if (!node) return;

    // Auto-fill with placeholder
    if (node.type === 'listen') {
      const listenData = node.data as ListenNodeData;
      setVariable(listenData.storeAs, '[skipped]');
      addHistory({
        type: 'user',
        message: '[skipped]',
      });
    }

    const nextNode = findNextNode(state.currentNodeId);
    if (nextNode) {
      setState((prev) => ({ ...prev, status: 'running' }));
      continueSimulation(nextNode.id);
    }
  }, [state.status, state.currentNodeId, findNode, setVariable, addHistory, findNextNode, continueSimulation]);

  return (
    <div className="h-full flex flex-col bg-background border-l">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4" />
          <span className="font-semibold">Flow Simulator</span>
        </div>
        <Badge
          variant={
            state.status === 'running'
              ? 'default'
              : state.status === 'waiting_input'
              ? 'secondary'
              : state.status === 'completed'
              ? 'outline'
              : state.status === 'error'
              ? 'destructive'
              : 'outline'
          }
        >
          {state.status === 'idle' && 'Ready'}
          {state.status === 'running' && 'Running'}
          {state.status === 'waiting_input' && 'Waiting for Input'}
          {state.status === 'completed' && 'Completed'}
          {state.status === 'error' && 'Error'}
        </Badge>
      </div>

      {/* Controls */}
      <div className="p-2 border-b flex items-center gap-2">
        {state.status === 'idle' ? (
          <Button size="sm" onClick={startSimulation} className="flex-1">
            <Play className="h-3 w-3 mr-1" /> Start Simulation
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={stepForward}
              disabled={state.status !== 'waiting_input'}
            >
              <SkipForward className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="outline" onClick={resetSimulation}>
              <RotateCcw className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>

      {/* Content */}
      <Tabs defaultValue="conversation" className="flex-1 flex flex-col">
        <TabsList className="mx-2 mt-2">
          <TabsTrigger value="conversation" className="text-xs">
            Conversation
          </TabsTrigger>
          <TabsTrigger value="variables" className="text-xs">
            Variables
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conversation" className="flex-1 flex flex-col m-0 p-0">
          <ScrollArea className="flex-1 p-2">
            <div className="space-y-2">
              {state.history.map((entry, index) => (
                <div
                  key={index}
                  className={`flex gap-2 ${
                    entry.type === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {entry.type !== 'user' && (
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                        entry.type === 'ai'
                          ? 'bg-primary/10'
                          : entry.type === 'system'
                          ? 'bg-muted'
                          : entry.type === 'branch'
                          ? 'bg-yellow-100'
                          : 'bg-blue-100'
                      }`}
                    >
                      {entry.type === 'ai' && <Bot className="h-3 w-3" />}
                      {entry.type === 'system' && <Clock className="h-3 w-3" />}
                      {entry.type === 'branch' && <ChevronRight className="h-3 w-3" />}
                      {entry.type === 'action' && <CheckCircle className="h-3 w-3" />}
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg p-2 text-sm ${
                      entry.type === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : entry.type === 'ai'
                        ? 'bg-muted'
                        : 'bg-muted/50 text-muted-foreground text-xs'
                    }`}
                  >
                    {entry.nodeName && (
                      <div className="text-[10px] opacity-70 mb-0.5">{entry.nodeName}</div>
                    )}
                    <div>{entry.message}</div>
                    {entry.details && (
                      <div className="text-[10px] opacity-70 mt-0.5">{entry.details}</div>
                    )}
                  </div>
                  {entry.type === 'user' && (
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-3 w-3" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Input area */}
          {state.status === 'waiting_input' && (
            <div className="p-2 border-t">
              <div className="flex gap-2">
                <Input
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="Enter simulated user response..."
                  onKeyDown={(e) => e.key === 'Enter' && handleUserInput()}
                  className="text-sm"
                />
                <Button size="sm" onClick={handleUserInput}>
                  <Send className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="variables" className="flex-1 m-0 p-2">
          <ScrollArea className="h-full">
            <div className="space-y-1">
              {Object.entries(state.variables).length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-4">
                  No variables yet. Start simulation to see variables.
                </div>
              ) : (
                Object.entries(state.variables).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2 p-2 rounded bg-muted/30">
                    <Variable className="h-3 w-3 mt-0.5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs font-medium">{key}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
