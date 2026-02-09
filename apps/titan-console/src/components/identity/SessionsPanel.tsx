import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/api-config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck, Clock, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Session {
  id: string;
  operator_id: string;
  started_at: string;
  last_active: string;
  is_current?: boolean;
}

interface SessionsResponse {
  current: Session;
  others: Session[];
}

export const SessionsPanel = () => {
  const { token, logout } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/auth/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch sessions');
      return res.json() as Promise<SessionsResponse>;
    },
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const current = data?.current;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            Active Session
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border rounded-lg bg-card/50">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-lg">{current?.operator_id}</span>
                <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10 gap-1 pl-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  This Session
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Started {new Date(current?.started_at || '').toLocaleString()}
                </div>
                <div>Last active: Just now</div>
              </div>
            </div>
            <Button variant="destructive" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Placeholder for other sessions if implemented */}
      {data?.others && data.others.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Other Devices</CardTitle>
          </CardHeader>
          <CardContent>
             {/* List others */}
             <div className="text-sm text-muted-foreground">No other active sessions.</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
