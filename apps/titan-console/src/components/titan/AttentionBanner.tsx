import React from 'react';
import { useAttention } from '@/context/AttentionContext';
import { AlertCircle, X, Check, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

export const AttentionBanner: React.FC = () => {
  const { activeBanner, dismiss } = useAttention();
  const navigate = useNavigate();

  if (!activeBanner) return null;

  const isCritical = activeBanner.severity === 'CRITICAL';
  
  const handleAction = () => {
    if (activeBanner.action_path) {
      if (activeBanner.action_path.type === 'link') {
        navigate(activeBanner.action_path.target);
      } else if (activeBanner.action_path.type === 'modal') {
        // TODO: Trigger modal via command palette or global state
        console.log('Open modal:', activeBanner.action_path.target);
      }
    }
  };

  return (
    <div
      className={cn(
        'w-full px-4 py-3 flex items-center justify-between shadow-md transition-colors duration-300 animate-in slide-in-from-top',
        isCritical ? 'bg-status-critical text-white' : 'bg-status-warning text-black'
      )}
    >
      <div className="flex items-center gap-3 flex-1 overflow-hidden">
        <AlertCircle className={cn('h-5 w-5 flex-shrink-0', isCritical ? 'text-white' : 'text-black')} />
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-sm uppercase tracking-wide truncate">
            {activeBanner.reason_code.replace(/_/g, ' ')}
          </span>
          <span className="text-xs truncate opacity-90">
            {activeBanner.message}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
        {activeBanner.action_path && (
          <button
            onClick={handleAction}
            className={cn(
              "p-2 rounded hover:bg-black/20 text-xs font-semibold flex items-center gap-1",
              isCritical ? "text-white" : "text-black"
            )}
          >
            {activeBanner.action_path.label || 'View'}
            <ArrowRight className="h-3 w-3" />
          </button>
        )}

        <button
          onClick={() => dismiss(activeBanner.id)}
          className={cn(
            "p-2 rounded hover:bg-black/20",
            isCritical ? "text-white" : "text-black"
          )}
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
