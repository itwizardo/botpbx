'use client';

import { memo, ReactNode } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { cn } from '@/lib/utils';

interface BaseNodeProps extends NodeProps {
  icon: ReactNode;
  color: string;
  children?: ReactNode;
  inputs?: number;
  outputs?: number | { id: string; label: string }[];
}

export const BaseNode = memo(function BaseNode({
  data,
  selected,
  icon,
  color,
  children,
  inputs = 1,
  outputs = 1,
}: BaseNodeProps) {
  const label = data.label || 'Node';

  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-background shadow-md min-w-[160px] transition-all',
        selected ? 'ring-2 ring-primary ring-offset-2' : ''
      )}
      style={{ borderColor: selected ? color : `${color}80` }}
    >
      {/* Input handles */}
      {inputs > 0 && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !border-2 !border-background"
          style={{ backgroundColor: color }}
        />
      )}

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-md"
        style={{ backgroundColor: `${color}15` }}
      >
        <div
          className="p-1 rounded"
          style={{ backgroundColor: `${color}25`, color }}
        >
          {icon}
        </div>
        <span className="font-medium text-sm truncate">{label}</span>
      </div>

      {/* Content */}
      {children && (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          {children}
        </div>
      )}

      {/* Output handles */}
      {typeof outputs === 'number' ? (
        outputs > 0 && (
          <Handle
            type="source"
            position={Position.Bottom}
            className="!w-3 !h-3 !border-2 !border-background"
            style={{ backgroundColor: color }}
          />
        )
      ) : (
        outputs.map((output, index) => {
          const total = outputs.length;
          const spacing = 100 / (total + 1);
          const left = spacing * (index + 1);

          return (
            <div key={output.id}>
              <Handle
                type="source"
                position={Position.Bottom}
                id={output.id}
                className="!w-3 !h-3 !border-2 !border-background"
                style={{
                  backgroundColor: color,
                  left: `${left}%`,
                }}
              />
              <span
                className="absolute text-[9px] text-muted-foreground whitespace-nowrap"
                style={{
                  bottom: '-20px',
                  left: `${left}%`,
                  transform: 'translateX(-50%)',
                }}
              >
                {output.label}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
});

export default BaseNode;
