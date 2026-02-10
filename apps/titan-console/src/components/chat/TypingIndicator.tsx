import React from 'react';
import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  className?: string;
}

export function TypingIndicator({ className }: TypingIndicatorProps) {
  return (
    <div className={cn("flex items-center gap-1 p-2 rounded-lg bg-muted/40 w-fit", className)}>
      <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.32s]" />
      <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.16s]" />
      <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" />
      <span className="sr-only">Titan is typing...</span>
    </div>
  );
}
