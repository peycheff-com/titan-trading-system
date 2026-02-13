import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Save, Loader2, AlertCircle, CheckCircle2, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const API_URL = import.meta.env.VITE_TITAN_API_URL || 'http://localhost:3100';

export const IntelligenceSettings = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [config, setConfig] = useState({
    'ai.gemini.apiKey': '',
    'ai.gemini.model': 'gemini-1.5-flash',
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
      setError('Failed to load intelligence settings');
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

      setSuccess('Intelligence settings saved successfully');
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
            <Sparkles className="h-5 w-5 text-purple-500" />
            <CardTitle>Artificial Intelligence</CardTitle>
          </div>
          <CardDescription>
            Configure external AI services used for News Analysis, Sentiment, and Strategic Reasoning.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="gemini-key">Gemini API Key</Label>
            <Input
              id="gemini-key"
              type="password"
              value={config['ai.gemini.apiKey']}
              onChange={(e) => handleChange('ai.gemini.apiKey', e.target.value)}
              placeholder="Enter Google Gemini API Key"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gemini-model">Model Version</Label>
            <Select 
              value={config['ai.gemini.model']} 
              onValueChange={(val) => handleChange('ai.gemini.model', val)}
            >
              <SelectTrigger id="gemini-model">
                <SelectValue placeholder="Select Model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash (Fastest)</SelectItem>
                <SelectItem value="gemini-1.5-pro">Gemini 1.5 Pro (Reasoning)</SelectItem>
                <SelectItem value="gemini-1.0-pro">Gemini 1.0 Pro (Legacy)</SelectItem>
              </SelectContent>
            </Select>
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
          <Button onClick={handleSave} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Intelligence Config
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
