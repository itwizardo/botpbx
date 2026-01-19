'use client';

import type { Node } from 'reactflow';
import { Trash2, AlertCircle, AlertTriangle, Settings2, Plus, GripVertical, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type {
  FlowNode,
  FlowValidationResult,
  StartNodeData,
  AIResponseNodeData,
  ListenNodeData,
  BranchNodeData,
  TransferNodeData,
  FunctionNodeData,
  CollectInfoNodeData,
  PlayAudioNodeData,
  EndNodeData,
  NodeData,
  CollectInfoField,
  BranchIntent,
  BranchKeyword,
  BranchVariableCondition,
  BranchClassificationOption,
} from '@/types/flow';
import { useState } from 'react';

interface FlowPropertiesPanelProps {
  selectedNode: Node | null;
  onUpdateNode: (nodeId: string, data: Partial<NodeData>) => void;
  onDeleteNode: (node: Node) => void;
  validation: FlowValidationResult | null;
}

export function FlowPropertiesPanel({
  selectedNode,
  onUpdateNode,
  onDeleteNode,
  validation,
}: FlowPropertiesPanelProps) {
  if (!selectedNode) {
    return (
      <div className="w-80 border-l bg-muted/20 p-4 flex flex-col items-center justify-center text-center text-muted-foreground">
        <Settings2 className="h-12 w-12 mb-4 opacity-30" />
        <p className="font-medium">No Node Selected</p>
        <p className="text-sm mt-1">Click a node to configure its properties</p>
      </div>
    );
  }

  const nodeErrors = validation?.errors.filter((e) => e.nodeId === selectedNode.id) || [];
  const nodeWarnings = validation?.warnings.filter((w) => w.nodeId === selectedNode.id) || [];

  const updateData = (updates: Partial<NodeData>) => {
    onUpdateNode(selectedNode.id, updates);
  };

  const renderNodeProperties = () => {
    const data = selectedNode.data as NodeData;
    const nodeType = selectedNode.type;

    switch (nodeType) {
      case 'start':
        return <StartNodeProperties data={data as StartNodeData} onChange={updateData} />;
      case 'aiResponse':
        return <AIResponseNodeProperties data={data as AIResponseNodeData} onChange={updateData} />;
      case 'listen':
        return <ListenNodeProperties data={data as ListenNodeData} onChange={updateData} />;
      case 'branch':
        return <BranchNodeProperties data={data as BranchNodeData} onChange={updateData} />;
      case 'transfer':
        return <TransferNodeProperties data={data as TransferNodeData} onChange={updateData} />;
      case 'function':
        return <FunctionNodeProperties data={data as FunctionNodeData} onChange={updateData} />;
      case 'collectInfo':
        return <CollectInfoNodeProperties data={data as CollectInfoNodeData} onChange={updateData} />;
      case 'playAudio':
        return <PlayAudioNodeProperties data={data as PlayAudioNodeData} onChange={updateData} />;
      case 'end':
        return <EndNodeProperties data={data as EndNodeData} onChange={updateData} />;
      default:
        return <div className="text-muted-foreground">Unknown node type</div>;
    }
  };

  return (
    <div className="w-80 border-l bg-muted/20 flex flex-col">
      <div className="p-3 border-b flex items-center justify-between">
        <div>
          <p className="font-semibold">{selectedNode.data.label || selectedNode.type}</p>
          <p className="text-xs text-muted-foreground capitalize">{selectedNode.type} Node</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          onClick={() => onDeleteNode(selectedNode)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Validation issues */}
      {(nodeErrors.length > 0 || nodeWarnings.length > 0) && (
        <div className="p-3 border-b space-y-2">
          {nodeErrors.map((error, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error.message}</span>
            </div>
          ))}
          {nodeWarnings.map((warning, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-yellow-600">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{warning.message}</span>
            </div>
          ))}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Common label field */}
          <div className="space-y-2">
            <Label>Node Label</Label>
            <Input
              value={selectedNode.data.label || ''}
              onChange={(e) => updateData({ label: e.target.value })}
              placeholder="Enter label..."
            />
          </div>

          <Separator />

          {/* Node-specific properties */}
          {renderNodeProperties()}
        </div>
      </ScrollArea>
    </div>
  );
}

// Start Node Properties
function StartNodeProperties({
  data,
  onChange,
}: {
  data: StartNodeData;
  onChange: (updates: Partial<StartNodeData>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Greeting Type</Label>
        <Select
          value={data.greetingType}
          onValueChange={(v) => onChange({ greetingType: v as 'text' | 'prompt' })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text (TTS)</SelectItem>
            <SelectItem value="prompt">Audio Prompt</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.greetingType === 'text' ? (
        <div className="space-y-2">
          <Label>Greeting Text</Label>
          <Textarea
            value={data.greetingText}
            onChange={(e) => onChange({ greetingText: e.target.value })}
            placeholder="Hello! How can I help you today?"
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            This text will be spoken by TTS when the call starts
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Prompt ID</Label>
          <Input
            value={data.promptId || ''}
            onChange={(e) => onChange({ promptId: e.target.value })}
            placeholder="Select prompt..."
          />
        </div>
      )}
    </div>
  );
}

// AI Response Node Properties
function AIResponseNodeProperties({
  data,
  onChange,
}: {
  data: AIResponseNodeData;
  onChange: (updates: Partial<AIResponseNodeData>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Response Type</Label>
        <Select
          value={data.promptType}
          onValueChange={(v) => onChange({ promptType: v as 'dynamic' | 'fixed' })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dynamic">Dynamic (AI Generated)</SelectItem>
            <SelectItem value="fixed">Fixed Response</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.promptType === 'dynamic' ? (
        <div className="space-y-2">
          <Label>Additional Instructions</Label>
          <Textarea
            value={data.instruction || ''}
            onChange={(e) => onChange({ instruction: e.target.value })}
            placeholder="Optional: Provide context or instructions for the AI..."
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            These instructions will be added to the system prompt for this response
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Fixed Response</Label>
          <Textarea
            value={data.fixedResponse || ''}
            onChange={(e) => onChange({ fixedResponse: e.target.value })}
            placeholder="Enter the exact response text..."
            rows={3}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Store Result As</Label>
        <Input
          value={data.storeResultAs || ''}
          onChange={(e) => onChange({ storeResultAs: e.target.value })}
          placeholder="variable_name"
        />
        <p className="text-xs text-muted-foreground">
          Optional: Save the AI response to a variable
        </p>
      </div>

      <div className="space-y-2">
        <Label>Temperature: {data.temperature || 0.7}</Label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={data.temperature || 0.7}
          onChange={(e) => onChange({ temperature: parseFloat(e.target.value) })}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          Lower = more consistent, Higher = more creative
        </p>
      </div>
    </div>
  );
}

// Listen Node Properties
function ListenNodeProperties({
  data,
  onChange,
}: {
  data: ListenNodeData;
  onChange: (updates: Partial<ListenNodeData>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Store Input As</Label>
        <Input
          value={data.storeAs}
          onChange={(e) => onChange({ storeAs: e.target.value })}
          placeholder="user_input"
        />
        <p className="text-xs text-muted-foreground">
          Variable name to store the user's response
        </p>
      </div>

      <div className="space-y-2">
        <Label>Timeout (seconds)</Label>
        <Input
          type="number"
          value={data.timeout}
          onChange={(e) => onChange({ timeout: parseInt(e.target.value) || 30 })}
          min={5}
          max={120}
        />
      </div>

      <div className="space-y-2">
        <Label>On Timeout</Label>
        <Select
          value={data.timeoutAction}
          onValueChange={(v) => onChange({ timeoutAction: v as 'continue' | 'repeat' | 'goto' })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="continue">Continue to next node</SelectItem>
            <SelectItem value="repeat">Repeat prompt</SelectItem>
            <SelectItem value="goto">Go to specific node</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.timeoutAction === 'repeat' && (
        <div className="space-y-2">
          <Label>Silence Prompt</Label>
          <Textarea
            value={data.silencePrompt || ''}
            onChange={(e) => onChange({ silencePrompt: e.target.value })}
            placeholder="I didn't hear anything. Could you please repeat?"
            rows={2}
          />
        </div>
      )}
    </div>
  );
}

// Branch Node Properties with Full Condition Builder
function BranchNodeProperties({
  data,
  onChange,
}: {
  data: BranchNodeData;
  onChange: (updates: Partial<BranchNodeData>) => void;
}) {
  const [expandedIntent, setExpandedIntent] = useState<number | null>(null);

  // Intent handlers
  const addIntent = () => {
    const newIntent: BranchIntent = {
      name: `intent_${(data.intents?.length || 0) + 1}`,
      examples: ['example phrase'],
      output: `output_${(data.intents?.length || 0) + 1}`,
    };
    onChange({ intents: [...(data.intents || []), newIntent] });
    setExpandedIntent(data.intents?.length || 0);
  };

  const updateIntent = (index: number, updates: Partial<BranchIntent>) => {
    const newIntents = [...(data.intents || [])];
    newIntents[index] = { ...newIntents[index], ...updates };
    onChange({ intents: newIntents });
  };

  const removeIntent = (index: number) => {
    onChange({ intents: (data.intents || []).filter((_, i) => i !== index) });
  };

  // Keyword handlers
  const addKeyword = () => {
    const newKeyword: BranchKeyword = {
      words: ['keyword'],
      output: `output_${(data.keywords?.length || 0) + 1}`,
    };
    onChange({ keywords: [...(data.keywords || []), newKeyword] });
  };

  const updateKeyword = (index: number, updates: Partial<BranchKeyword>) => {
    const newKeywords = [...(data.keywords || [])];
    newKeywords[index] = { ...newKeywords[index], ...updates };
    onChange({ keywords: newKeywords });
  };

  const removeKeyword = (index: number) => {
    onChange({ keywords: (data.keywords || []).filter((_, i) => i !== index) });
  };

  // Variable condition handlers
  const addVariableCondition = () => {
    const newCond: BranchVariableCondition = {
      variable: 'variable_name',
      operator: 'equals',
      value: '',
      output: `output_${(data.variableConditions?.length || 0) + 1}`,
    };
    onChange({ variableConditions: [...(data.variableConditions || []), newCond] });
  };

  const updateVariableCondition = (index: number, updates: Partial<BranchVariableCondition>) => {
    const newConds = [...(data.variableConditions || [])];
    newConds[index] = { ...newConds[index], ...updates };
    onChange({ variableConditions: newConds });
  };

  const removeVariableCondition = (index: number) => {
    onChange({ variableConditions: (data.variableConditions || []).filter((_, i) => i !== index) });
  };

  // Classification option handlers
  const addClassificationOption = () => {
    const newOpt: BranchClassificationOption = {
      label: `option_${(data.classificationOptions?.length || 0) + 1}`,
      description: 'Describe when this option should be selected',
      output: `output_${(data.classificationOptions?.length || 0) + 1}`,
    };
    onChange({ classificationOptions: [...(data.classificationOptions || []), newOpt] });
  };

  const updateClassificationOption = (index: number, updates: Partial<BranchClassificationOption>) => {
    const newOpts = [...(data.classificationOptions || [])];
    newOpts[index] = { ...newOpts[index], ...updates };
    onChange({ classificationOptions: newOpts });
  };

  const removeClassificationOption = (index: number) => {
    onChange({ classificationOptions: (data.classificationOptions || []).filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Condition Type</Label>
        <Select
          value={data.conditionType}
          onValueChange={(v) =>
            onChange({ conditionType: v as 'intent' | 'keyword' | 'variable' | 'ai_classification' })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="intent">Intent Detection (AI)</SelectItem>
            <SelectItem value="keyword">Keyword Matching</SelectItem>
            <SelectItem value="variable">Variable Check</SelectItem>
            <SelectItem value="ai_classification">AI Classification</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {data.conditionType === 'intent' && 'AI classifies user intent based on example phrases'}
          {data.conditionType === 'keyword' && 'Match specific words in user input'}
          {data.conditionType === 'variable' && 'Check stored variable values'}
          {data.conditionType === 'ai_classification' && 'Custom AI prompt for classification'}
        </p>
      </div>

      <Separator />

      {/* Intent Editor */}
      {data.conditionType === 'intent' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Intents</Label>
            <Button variant="outline" size="sm" onClick={addIntent}>
              <Plus className="h-3 w-3 mr-1" /> Add Intent
            </Button>
          </div>

          {(!data.intents || data.intents.length === 0) ? (
            <div className="bg-muted/50 rounded p-3 text-center text-sm text-muted-foreground">
              No intents configured. Add intents to route based on user intent.
            </div>
          ) : (
            <div className="space-y-2">
              {data.intents.map((intent, index) => (
                <Collapsible
                  key={index}
                  open={expandedIntent === index}
                  onOpenChange={(open) => setExpandedIntent(open ? index : null)}
                >
                  <div className="border rounded-lg bg-background">
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center gap-2 p-2 hover:bg-muted/50">
                        <div className="flex-1 text-left">
                          <span className="font-medium text-sm">{intent.name}</span>
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            {intent.examples.length} examples
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={(e) => { e.stopPropagation(); removeIntent(index); }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-3 pt-0 space-y-3 border-t">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Intent Name</Label>
                            <Input
                              value={intent.name}
                              onChange={(e) => updateIntent(index, { name: e.target.value })}
                              placeholder="sales_inquiry"
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Output Handle</Label>
                            <Input
                              value={intent.output}
                              onChange={(e) => updateIntent(index, { output: e.target.value })}
                              placeholder="output_1"
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Example Phrases (one per line)</Label>
                          <Textarea
                            value={intent.examples.join('\n')}
                            onChange={(e) => updateIntent(index, {
                              examples: e.target.value.split('\n').filter(s => s.trim())
                            })}
                            placeholder="I want to buy something\nI'm interested in purchasing\nCan I place an order"
                            rows={3}
                            className="text-sm"
                          />
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Keyword Editor */}
      {data.conditionType === 'keyword' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Keywords</Label>
            <Button variant="outline" size="sm" onClick={addKeyword}>
              <Plus className="h-3 w-3 mr-1" /> Add Keyword
            </Button>
          </div>

          {(!data.keywords || data.keywords.length === 0) ? (
            <div className="bg-muted/50 rounded p-3 text-center text-sm text-muted-foreground">
              No keywords configured. Add keywords to match.
            </div>
          ) : (
            <div className="space-y-2">
              {data.keywords.map((kw, index) => (
                <div key={index} className="border rounded-lg p-3 bg-background space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Keywords (comma-separated)</Label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => removeKeyword(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <Input
                    value={kw.words.join(', ')}
                    onChange={(e) => updateKeyword(index, {
                      words: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    })}
                    placeholder="yes, sure, okay"
                    className="h-8 text-sm"
                  />
                  <div className="space-y-1">
                    <Label className="text-xs">Output Handle</Label>
                    <Input
                      value={kw.output}
                      onChange={(e) => updateKeyword(index, { output: e.target.value })}
                      placeholder="output_yes"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Variable Condition Editor */}
      {data.conditionType === 'variable' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Variable Conditions</Label>
            <Button variant="outline" size="sm" onClick={addVariableCondition}>
              <Plus className="h-3 w-3 mr-1" /> Add Condition
            </Button>
          </div>

          {(!data.variableConditions || data.variableConditions.length === 0) ? (
            <div className="bg-muted/50 rounded p-3 text-center text-sm text-muted-foreground">
              No conditions configured. Add conditions to check variables.
            </div>
          ) : (
            <div className="space-y-2">
              {data.variableConditions.map((cond, index) => (
                <div key={index} className="border rounded-lg p-3 bg-background space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Condition {index + 1}</Label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => removeVariableCondition(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <Input
                      value={cond.variable}
                      onChange={(e) => updateVariableCondition(index, { variable: e.target.value })}
                      placeholder="var_name"
                      className="h-8 text-sm"
                    />
                    <Select
                      value={cond.operator}
                      onValueChange={(v) => updateVariableCondition(index, { operator: v as any })}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="equals">=</SelectItem>
                        <SelectItem value="contains">contains</SelectItem>
                        <SelectItem value="greater">&gt;</SelectItem>
                        <SelectItem value="less">&lt;</SelectItem>
                        <SelectItem value="empty">empty</SelectItem>
                        <SelectItem value="not_empty">not empty</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={cond.value}
                      onChange={(e) => updateVariableCondition(index, { value: e.target.value })}
                      placeholder="value"
                      className="h-8 text-sm"
                      disabled={cond.operator === 'empty' || cond.operator === 'not_empty'}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Output Handle</Label>
                    <Input
                      value={cond.output}
                      onChange={(e) => updateVariableCondition(index, { output: e.target.value })}
                      placeholder="output_match"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI Classification Editor */}
      {data.conditionType === 'ai_classification' && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Classification Prompt</Label>
            <Textarea
              value={data.classificationPrompt || ''}
              onChange={(e) => onChange({ classificationPrompt: e.target.value })}
              placeholder="Classify the user's response as positive, negative, or neutral based on their sentiment."
              rows={3}
              className="text-sm"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>Classification Options</Label>
            <Button variant="outline" size="sm" onClick={addClassificationOption}>
              <Plus className="h-3 w-3 mr-1" /> Add Option
            </Button>
          </div>

          {(!data.classificationOptions || data.classificationOptions.length === 0) ? (
            <div className="bg-muted/50 rounded p-3 text-center text-sm text-muted-foreground">
              No options configured. Add classification options.
            </div>
          ) : (
            <div className="space-y-2">
              {data.classificationOptions.map((opt, index) => (
                <div key={index} className="border rounded-lg p-3 bg-background space-y-2">
                  <div className="flex items-center justify-between">
                    <Input
                      value={opt.label}
                      onChange={(e) => updateClassificationOption(index, { label: e.target.value })}
                      placeholder="Option label"
                      className="h-8 text-sm flex-1 mr-2"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => removeClassificationOption(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <Textarea
                    value={opt.description}
                    onChange={(e) => updateClassificationOption(index, { description: e.target.value })}
                    placeholder="Describe when AI should select this option"
                    rows={2}
                    className="text-sm"
                  />
                  <div className="space-y-1">
                    <Label className="text-xs">Output Handle</Label>
                    <Input
                      value={opt.output}
                      onChange={(e) => updateClassificationOption(index, { output: e.target.value })}
                      placeholder="output_positive"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Separator />

      <div className="space-y-2">
        <Label>Default Output</Label>
        <Input
          value={data.defaultOutput}
          onChange={(e) => onChange({ defaultOutput: e.target.value })}
          placeholder="default"
        />
        <p className="text-xs text-muted-foreground">
          Output handle when no conditions match
        </p>
      </div>
    </div>
  );
}

// Transfer Node Properties
function TransferNodeProperties({
  data,
  onChange,
}: {
  data: TransferNodeData;
  onChange: (updates: Partial<TransferNodeData>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Transfer Type</Label>
        <Select
          value={data.transferType}
          onValueChange={(v) =>
            onChange({ transferType: v as 'extension' | 'queue' | 'ring_group' | 'external' | 'trunk' })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="extension">Extension</SelectItem>
            <SelectItem value="queue">Queue</SelectItem>
            <SelectItem value="ring_group">Ring Group</SelectItem>
            <SelectItem value="external">External Number</SelectItem>
            <SelectItem value="trunk">Via Trunk</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Destination</Label>
        <Input
          value={data.destination}
          onChange={(e) => onChange({ destination: e.target.value })}
          placeholder={
            data.transferType === 'extension'
              ? '1001'
              : data.transferType === 'external'
              ? '+31612345678'
              : 'Enter destination...'
          }
        />
      </div>

      <div className="space-y-2">
        <Label>Announce To</Label>
        <Select
          value={data.announceTo}
          onValueChange={(v) => onChange({ announceTo: v as 'caller' | 'agent' | 'both' | 'none' })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No announcement</SelectItem>
            <SelectItem value="caller">Caller only</SelectItem>
            <SelectItem value="agent">Agent only</SelectItem>
            <SelectItem value="both">Both parties</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.announceTo !== 'none' && (
        <div className="space-y-2">
          <Label>Announcement Message</Label>
          <Textarea
            value={data.announceMessage || ''}
            onChange={(e) => onChange({ announceMessage: e.target.value })}
            placeholder="Please hold while I transfer your call..."
            rows={2}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Timeout (seconds)</Label>
        <Input
          type="number"
          value={data.timeout}
          onChange={(e) => onChange({ timeout: parseInt(e.target.value) || 30 })}
          min={10}
          max={120}
        />
      </div>

      <div className="space-y-2">
        <Label>On Failure</Label>
        <Select
          value={data.failoverAction}
          onValueChange={(v) => onChange({ failoverAction: v as 'continue' | 'end' | 'goto' })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="continue">Continue to next node</SelectItem>
            <SelectItem value="end">End call</SelectItem>
            <SelectItem value="goto">Go to specific node</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// Function Node Properties
function FunctionNodeProperties({
  data,
  onChange,
}: {
  data: FunctionNodeData;
  onChange: (updates: Partial<FunctionNodeData>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Function Type</Label>
        <Select
          value={data.functionType}
          onValueChange={(v) => onChange({ functionType: v as 'builtin' | 'webhook' })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="builtin">Built-in Function</SelectItem>
            <SelectItem value="webhook">Webhook (HTTP)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.functionType === 'builtin' ? (
        <div className="space-y-2">
          <Label>Function</Label>
          <Select
            value={data.builtinFunction || ''}
            onValueChange={(v) => onChange({ builtinFunction: v as FunctionNodeData['builtinFunction'] })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select function..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lookup_customer">Lookup Customer</SelectItem>
              <SelectItem value="check_hours">Check Business Hours</SelectItem>
              <SelectItem value="send_sms">Send SMS</SelectItem>
              <SelectItem value="schedule_callback">Schedule Callback</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <Input
              value={data.webhookUrl || ''}
              onChange={(e) => onChange({ webhookUrl: e.target.value })}
              placeholder="https://api.example.com/webhook"
            />
          </div>

          <div className="space-y-2">
            <Label>Method</Label>
            <Select
              value={data.webhookMethod || 'POST'}
              onValueChange={(v) => onChange({ webhookMethod: v as 'GET' | 'POST' | 'PUT' | 'DELETE' })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Request Body (JSON)</Label>
            <Textarea
              value={data.webhookBody || ''}
              onChange={(e) => onChange({ webhookBody: e.target.value })}
              placeholder='{"caller": "{{caller_id}}"}'
              rows={3}
              className="font-mono text-xs"
            />
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label>Store Result As</Label>
        <Input
          value={data.storeResultAs || ''}
          onChange={(e) => onChange({ storeResultAs: e.target.value })}
          placeholder="api_result"
        />
      </div>

      <div className="space-y-2">
        <Label>On Error</Label>
        <Select
          value={data.onError}
          onValueChange={(v) => onChange({ onError: v as 'continue' | 'retry' | 'goto' })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="continue">Continue to next node</SelectItem>
            <SelectItem value="retry">Retry (up to 3 times)</SelectItem>
            <SelectItem value="goto">Go to error node</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// Collect Info Node Properties with Full Field Editor
function CollectInfoNodeProperties({
  data,
  onChange,
}: {
  data: CollectInfoNodeData;
  onChange: (updates: Partial<CollectInfoNodeData>) => void;
}) {
  const [expandedField, setExpandedField] = useState<number | null>(null);

  const addField = () => {
    const newField: CollectInfoField = {
      name: `field_${(data.fields?.length || 0) + 1}`,
      prompt: 'What is your value?',
      type: 'text',
      required: true,
    };
    onChange({ fields: [...(data.fields || []), newField] });
    setExpandedField((data.fields?.length || 0));
  };

  const updateField = (index: number, updates: Partial<CollectInfoField>) => {
    const newFields = [...(data.fields || [])];
    newFields[index] = { ...newFields[index], ...updates };
    onChange({ fields: newFields });
  };

  const removeField = (index: number) => {
    const newFields = (data.fields || []).filter((_, i) => i !== index);
    onChange({ fields: newFields });
    if (expandedField === index) setExpandedField(null);
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const newFields = [...(data.fields || [])];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newFields.length) return;
    [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
    onChange({ fields: newFields });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Fields to Collect</Label>
          <Button variant="outline" size="sm" onClick={addField}>
            <Plus className="h-3 w-3 mr-1" /> Add Field
          </Button>
        </div>

        {(!data.fields || data.fields.length === 0) ? (
          <div className="bg-muted/50 rounded p-4 text-center text-sm text-muted-foreground">
            No fields configured. Click "Add Field" to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {data.fields.map((field, index) => (
              <Collapsible
                key={index}
                open={expandedField === index}
                onOpenChange={(open) => setExpandedField(open ? index : null)}
              >
                <div className="border rounded-lg bg-background">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center gap-2 p-2 hover:bg-muted/50">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1 text-left">
                        <span className="font-medium text-sm">{field.name}</span>
                        <Badge variant="outline" className="ml-2 text-[10px]">{field.type}</Badge>
                        {field.required && <Badge variant="secondary" className="ml-1 text-[10px]">Required</Badge>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => { e.stopPropagation(); moveField(index, 'up'); }}
                          disabled={index === 0}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => { e.stopPropagation(); moveField(index, 'down'); }}
                          disabled={index === data.fields.length - 1}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={(e) => { e.stopPropagation(); removeField(index); }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-3 pt-0 space-y-3 border-t">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Field Name</Label>
                          <Input
                            value={field.name}
                            onChange={(e) => updateField(index, { name: e.target.value.replace(/\s/g, '_') })}
                            placeholder="field_name"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Type</Label>
                          <Select
                            value={field.type}
                            onValueChange={(v) => updateField(index, { type: v as CollectInfoField['type'] })}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Text</SelectItem>
                              <SelectItem value="phone">Phone Number</SelectItem>
                              <SelectItem value="email">Email</SelectItem>
                              <SelectItem value="number">Number</SelectItem>
                              <SelectItem value="date">Date</SelectItem>
                              <SelectItem value="time">Time</SelectItem>
                              <SelectItem value="yes_no">Yes/No</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Prompt Question</Label>
                        <Textarea
                          value={field.prompt}
                          onChange={(e) => updateField(index, { prompt: e.target.value })}
                          placeholder="What is your phone number?"
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Required</Label>
                        <Switch
                          checked={field.required}
                          onCheckedChange={(v) => updateField(index, { required: v })}
                        />
                      </div>
                      {field.type === 'text' && (
                        <div className="space-y-1">
                          <Label className="text-xs">Validation Pattern (Regex)</Label>
                          <Input
                            value={field.validation?.pattern || ''}
                            onChange={(e) => updateField(index, {
                              validation: { ...field.validation, pattern: e.target.value }
                            })}
                            placeholder="^[A-Za-z ]+$"
                            className="h-8 text-sm font-mono"
                          />
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Confirm All Fields</Label>
          <p className="text-xs text-muted-foreground">
            Ask caller to confirm after collecting
          </p>
        </div>
        <Switch
          checked={data.confirmAll}
          onCheckedChange={(v) => onChange({ confirmAll: v })}
        />
      </div>

      <div className="space-y-2">
        <Label>On Complete</Label>
        <Select
          value={data.onComplete}
          onValueChange={(v) => onChange({ onComplete: v as 'continue' | 'summary' })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="continue">Continue to next node</SelectItem>
            <SelectItem value="summary">Read back summary</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.onComplete === 'summary' && (
        <div className="space-y-2">
          <Label>Summary Template</Label>
          <Textarea
            value={data.summaryTemplate || ''}
            onChange={(e) => onChange({ summaryTemplate: e.target.value })}
            placeholder="I have your name as {{name}} and phone as {{phone}}. Is that correct?"
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Use {"{{field_name}}"} to insert collected values
          </p>
        </div>
      )}
    </div>
  );
}

// Play Audio Node Properties
function PlayAudioNodeProperties({
  data,
  onChange,
}: {
  data: PlayAudioNodeData;
  onChange: (updates: Partial<PlayAudioNodeData>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Audio Source</Label>
        <Select
          value={data.source}
          onValueChange={(v) => onChange({ source: v as 'prompt' | 'url' | 'tts' })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tts">Text-to-Speech</SelectItem>
            <SelectItem value="prompt">Audio Prompt</SelectItem>
            <SelectItem value="url">URL</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.source === 'tts' && (
        <div className="space-y-2">
          <Label>Text to Speak</Label>
          <Textarea
            value={data.ttsText || ''}
            onChange={(e) => onChange({ ttsText: e.target.value })}
            placeholder="Enter the text to be spoken..."
            rows={3}
          />
        </div>
      )}

      {data.source === 'prompt' && (
        <div className="space-y-2">
          <Label>Prompt ID</Label>
          <Input
            value={data.promptId || ''}
            onChange={(e) => onChange({ promptId: e.target.value })}
            placeholder="Select audio prompt..."
          />
        </div>
      )}

      {data.source === 'url' && (
        <div className="space-y-2">
          <Label>Audio URL</Label>
          <Input
            value={data.audioUrl || ''}
            onChange={(e) => onChange({ audioUrl: e.target.value })}
            placeholder="https://example.com/audio.wav"
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Interruptible</Label>
          <p className="text-xs text-muted-foreground">
            Allow caller to speak during playback
          </p>
        </div>
        <Switch
          checked={data.interruptible}
          onCheckedChange={(v) => onChange({ interruptible: v })}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>DTMF Enabled</Label>
          <p className="text-xs text-muted-foreground">
            Detect keypad input during playback
          </p>
        </div>
        <Switch
          checked={data.dtmfEnabled}
          onCheckedChange={(v) => onChange({ dtmfEnabled: v })}
        />
      </div>
    </div>
  );
}

// End Node Properties
function EndNodeProperties({
  data,
  onChange,
}: {
  data: EndNodeData;
  onChange: (updates: Partial<EndNodeData>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Goodbye Type</Label>
        <Select
          value={data.goodbyeType}
          onValueChange={(v) => onChange({ goodbyeType: v as 'text' | 'prompt' | 'none' })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text (TTS)</SelectItem>
            <SelectItem value="prompt">Audio Prompt</SelectItem>
            <SelectItem value="none">No goodbye</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.goodbyeType === 'text' && (
        <div className="space-y-2">
          <Label>Goodbye Message</Label>
          <Textarea
            value={data.goodbyeMessage || ''}
            onChange={(e) => onChange({ goodbyeMessage: e.target.value })}
            placeholder="Thank you for calling. Goodbye!"
            rows={2}
          />
        </div>
      )}

      {data.goodbyeType === 'prompt' && (
        <div className="space-y-2">
          <Label>Prompt ID</Label>
          <Input
            value={data.promptId || ''}
            onChange={(e) => onChange({ promptId: e.target.value })}
            placeholder="Select prompt..."
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Call Outcome</Label>
        <Select
          value={data.outcome}
          onValueChange={(v) =>
            onChange({ outcome: v as 'completed' | 'transferred' | 'abandoned' | 'error' })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="completed">Completed Successfully</SelectItem>
            <SelectItem value="transferred">Transferred</SelectItem>
            <SelectItem value="abandoned">Abandoned</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Used for analytics and reporting
        </p>
      </div>

      <div className="space-y-2">
        <Label>Outcome Details</Label>
        <Input
          value={data.outcomeDetails || ''}
          onChange={(e) => onChange({ outcomeDetails: e.target.value })}
          placeholder="Optional notes about the outcome"
        />
      </div>
    </div>
  );
}
