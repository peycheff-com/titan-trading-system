import React from 'react';
import { useReplay } from '@/context/ReplayContext';
import { cn } from '@/lib/utils';

export const ReplayOverlay: React.FC = () => {
  const { isReplayMode } = useReplay();

  if (!isReplayMode) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
      {/* Red Warning Border */}
      <div className="absolute inset-0 border-[4px] border-amber-500/50 shadow-[inset_0_0_20px_rgba(245,158,11,0.3)] animate-pulse" />
      
      {/* VHS Scanlines */}
      <div 
        className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))]"
        style={{ backgroundSize: '100% 2px, 3px 100%' }}
      />
      
      {/* "REPLAY MODE" Watermark */}
      <div className="absolute bottom-4 right-4 text-6xl font-black text-amber-500/10 tracking-tighter select-none rotate-[-15deg]">
        REPLAY ACTIVE
      </div>
       <div className="absolute top-4 left-4 text-6xl font-black text-amber-500/10 tracking-tighter select-none rotate-[-15deg]">
        READ ONLY
      </div>
    </div>
  );
};
