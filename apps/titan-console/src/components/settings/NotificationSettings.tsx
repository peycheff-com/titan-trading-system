import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, Loader2, AlertCircle, CheckCircle2, Bell } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const API_URL = import.meta.env.VITE_TITAN_API_URL || 'http://localhost:3100';

export const NotificationSettings = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [config, setConfig] = useState({
    'notifications.telegram.botToken': '',
    'notifications.telegram.chatId': '',
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const resAll = await fetch(`${API_URL}/config/effective`);
      if (!resAll.ok) throw new Error('Failed to fetch config');
      const data = await resAll.json();
      
      const newConfig = { ...config };
      data.configs.forEach((item: any) => {
        if (item.key in newConfig) {
          newConfig[item.key as keyof typeof config] = item.value;
        }
      });
      setConfig(newConfig);
    } catch (err) {
      console.error(err);
      setError('Failed to load notification settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const overrides = Object.entries(config).map(([key, value]) => ({
      key,
      value,
      reason: 'Updated via Titan Console Settings',
    }));

    try {
      const res = await fetch(`${API_URL}/config/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save settings');
      }

      setSuccess('Notification settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: keyof typeof config, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Bell className="h-5 w-5 text-blue-500" />
            <CardTitle>Notifications</CardTitle>
          </div>
          <CardDescription>
            Configure alert channels for trading signals, risk events, and system health.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="tg-token">Telegram Bot Token</Label>
            <Input
              id="tg-token"
              type="password"
              value={config['notifications.telegram.botToken']}
              onChange={(e) => handleChange('notifications.telegram.botToken', e.target.value)}
              placeholder="e.g. 123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
            />
            <p className="text-sm text-muted-foreground">
              Create a bot via <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="underline">@BotFather</a> to get a token.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tg-chat">Telegram Chat ID</Label>
            <Input
              id="tg-chat"
              value={config['notifications.telegram.chatId']}
              onChange={(e) => handleChange('notifications.telegram.chatId', e.target.value)}
              placeholder="e.g. -1001234567890"
            />
             <p className="text-sm text-muted-foreground">
              Add your bot to a group or channel and get the Chat ID.
            </p>
          </div>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mt-4 border-green-500 text-green-500">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Notification Config
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
