import React from 'react';
import { useAttention } from '@/context/AttentionContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Check, Clock, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

export const NotificationInbox: React.FC = () => {
  const { notifications, isInboxOpen, setInboxOpen, dismiss, snooze, clearAll } = useAttention();

  const handleOpenChange = (open: boolean) => {
    setInboxOpen(open);
  };

  return (
    <Sheet open={isInboxOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px] flex flex-col p-0">
        <SheetHeader className="p-6 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle>Notifications</SheetTitle>
            {notifications.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            )}
          </div>
          <SheetDescription>
            {notifications.filter(n => !n.acknowledged).length} unread alerts
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="flex flex-col gap-4 py-6">
            {notifications.length === 0 ? (
              <div className="text-center text-muted-foreground py-10">
                No notifications
              </div>
            ) : (
              notifications.map((notification) => (
                <div 
                  key={notification.id} 
                  className={cn(
                    "relative p-4 rounded-lg border transition-all hover:bg-muted/50",
                    !notification.acknowledged ? "bg-muted/30 border-l-4 border-l-primary" : "border-border opactiy-70"
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-sm">
                      {notification.reason_code.replace(/_/g, ' ')}
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      {formatTimeAgo(notification.timestamp)}
                    </span>
                  </div>
                  
                  <p className="text-sm text-foreground/80 mb-3 break-words">
                    {notification.message}
                  </p>
                  
                  <div className="flex items-center gap-2 justify-end">
                    {!notification.acknowledged && (
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 text-xs"
                            onClick={() => dismiss(notification.id)}
                        >
                            <Check className="h-3 w-3 mr-1" />
                            Acknowledge
                        </Button>
                    )}
                    {/* Snooze functionality could be a dropdown, kept simple here */}
                     <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7"
                        onClick={() => snooze(notification.id, 1000 * 60 * 15)} // 15 min
                        title="Snooze 15m"
                     >
                        <Clock className="h-3 w-3" />
                     </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
