'use client';

import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export type StatsVariant = 'default' | 'yellow' | 'pink' | 'blue' | 'green' | 'red' | 'orange';

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  loading?: boolean;
  className?: string;
  variant?: StatsVariant;
}

const variantStyles: Record<StatsVariant, {
  border: string;
  bg: string;
  iconBg: string;
  iconColor: string;
  badge: string;
}> = {
  default: {
    border: 'hover:border-primary/50',
    bg: 'from-primary/10',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    badge: 'bg-primary/20 text-primary',
  },
  yellow: {
    border: 'hover:border-yellow-500/50',
    bg: 'from-yellow-500/10',
    iconBg: 'bg-yellow-500/10',
    iconColor: 'text-yellow-500',
    badge: 'bg-yellow-500/20 text-yellow-500',
  },
  pink: {
    border: 'hover:border-pink-500/50',
    bg: 'from-pink-500/10',
    iconBg: 'bg-pink-500/10',
    iconColor: 'text-pink-500',
    badge: 'bg-pink-500/20 text-pink-500',
  },
  blue: {
    border: 'hover:border-blue-500/50',
    bg: 'from-blue-500/10',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-500',
    badge: 'bg-blue-500/20 text-blue-500',
  },
  green: {
    border: 'hover:border-green-500/50',
    bg: 'from-green-500/10',
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-500',
    badge: 'bg-green-500/20 text-green-500',
  },
  red: {
    border: 'hover:border-red-500/50',
    bg: 'from-red-500/10',
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-500',
    badge: 'bg-red-500/20 text-red-500',
  },
  orange: {
    border: 'hover:border-orange-500/50',
    bg: 'from-orange-500/10',
    iconBg: 'bg-orange-500/10',
    iconColor: 'text-orange-500',
    badge: 'bg-orange-500/20 text-orange-500',
  },
};

export function StatsCard({
  title,
  value,
  description,
  icon,
  trend,
  loading,
  className,
  variant = 'default',
}: StatsCardProps) {
  const styles = variantStyles[variant];

  if (loading) {
    return (
      <Card className={cn('border-border/50 shadow-sm bg-card/50', className)}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-10 rounded-xl" />
          </div>
          <div className="mt-4">
            <Skeleton className="h-8 w-16" />
            {description && <Skeleton className="h-3 w-32 mt-2" />}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(
      'group relative overflow-hidden transition-all duration-300',
      'bg-card border-border/50',
      'hover:shadow-lg hover:-translate-y-1',
      styles.border,
      className
    )}>
      {/* Gradient Background Effect */}
      <div className={cn(
        'absolute inset-0 bg-gradient-to-br to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100',
        styles.bg
      )} />

      <CardContent className="relative p-6">
        {/* Header with Icon */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
              {title}
            </p>
            <h3 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {value}
            </h3>
          </div>
          {icon && (
            <div className={cn(
              'flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300 shadow-sm group-hover:scale-110',
              styles.iconBg,
              styles.iconColor
            )}>
              {icon}
            </div>
          )}
        </div>

        {/* Footer with Description and Trend */}
        <div className="mt-4 flex items-center justify-between text-xs">
          {description && (
            <p className="text-muted-foreground/80 font-medium truncate max-w-[70%]">
              {description}
            </p>
          )}

          {trend && (
            <span
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-full font-medium ml-auto',
                trend.isPositive
                  ? 'text-emerald-500 bg-emerald-500/10'
                  : 'text-rose-500 bg-rose-500/10'
              )}
            >
              <span className={cn('text-[10px]', trend.isPositive ? 'rotate-[-45deg]' : 'rotate-45')}>
                ➜
              </span>
              {trend.value}%
            </span>
          )}

          {!trend && (
            <div className={cn('h-1.5 w-1.5 rounded-full ml-auto animate-pulse', styles.iconBg.replace('bg-', 'bg-').replace('/10', ''))} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
