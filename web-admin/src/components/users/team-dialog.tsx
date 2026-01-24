'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Queue {
  id: string;
  name: string;
}

interface TeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team?: {
    id: string;
    name: string;
    description?: string | null;
    color: string;
    queueId?: string | null;
  } | null;
  queues: Queue[];
  onSave: (data: {
    name: string;
    description: string;
    color: string;
    queueId: string | null;
  }) => Promise<void>;
}

const colors = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'green', label: 'Green', class: 'bg-green-500' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { value: 'red', label: 'Red', class: 'bg-red-500' },
  { value: 'yellow', label: 'Yellow', class: 'bg-yellow-500' },
  { value: 'pink', label: 'Pink', class: 'bg-pink-500' },
  { value: 'cyan', label: 'Cyan', class: 'bg-cyan-500' },
];

export function TeamDialog({
  open,
  onOpenChange,
  team,
  queues,
  onSave,
}: TeamDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('blue');
  const [queueId, setQueueId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEditing = !!team;

  useEffect(() => {
    if (team) {
      setName(team.name);
      setDescription(team.description || '');
      setColor(team.color);
      setQueueId(team.queueId || null);
    } else {
      setName('');
      setDescription('');
      setColor('blue');
      setQueueId(null);
    }
  }, [team, open]);

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        color,
        queueId,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Team' : 'Create Team'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update team details and settings.'
              : 'Create a new team to organize users.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Team Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Support Team"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this team do?"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {colors.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`w-8 h-8 rounded-full ${c.class} transition-all ${
                    color === c.value ? 'ring-2 ring-offset-2 ring-primary' : 'opacity-60 hover:opacity-100'
                  }`}
                  onClick={() => setColor(c.value)}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="queue">Link to Queue (Optional)</Label>
            <Select value={queueId || 'none'} onValueChange={(v) => setQueueId(v === 'none' ? null : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a queue" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No queue linked</SelectItem>
                {queues.map((queue) => (
                  <SelectItem key={queue.id} value={queue.id}>
                    {queue.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Link this team to a call queue for routing purposes.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? 'Save Changes' : 'Create Team'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
