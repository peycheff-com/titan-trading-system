/**
 * Credentials Page - SOTA API Key Management UI
 *
 * Features:
 * - Provider cards for each exchange/service
 * - Secure input with masked display
 * - Connection testing
 * - Audit-logged operations
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Key,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Loader2,
  Shield,
  RefreshCw,
  Trash2,
  Save,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface ProviderCredential {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
}

interface ProviderConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  hasTestnet: boolean;
  secretLabel: string;
  category: 'exchange' | 'ai';
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'bybit',
    name: 'Bybit',
    description: 'Derivatives & spot trading',
    icon: '₿',
    color: 'from-yellow-500 to-orange-500',
    hasTestnet: true,
    secretLabel: 'API Secret',
    category: 'exchange',
  },
  {
    id: 'binance',
    name: 'Binance',
    description: 'World\'s largest exchange',
    icon: '🔶',
    color: 'from-yellow-400 to-yellow-600',
    hasTestnet: true,
    secretLabel: 'API Secret',
    category: 'exchange',
  },
  {
    id: 'deribit',
    name: 'Deribit',
    description: 'Options & futures',
    icon: '📈',
    color: 'from-green-500 to-emerald-600',
    hasTestnet: true,
    secretLabel: 'API Secret',
    category: 'exchange',
  },
  {
    id: 'hyperliquid',
    name: 'Hyperliquid',
    description: 'DEX perpetuals',
    icon: '💧',
    color: 'from-blue-500 to-cyan-500',
    hasTestnet: false,
    secretLabel: 'Private Key',
    category: 'exchange',
  },
  {
    id: 'gemini',
    name: 'Gemini AI',
    description: 'AI-powered optimization',
    icon: '🤖',
    color: 'from-purple-500 to-pink-500',
    hasTestnet: false,
    secretLabel: '', // No secret needed
    category: 'ai',
  },
];

interface ProviderState {
  credentials: ProviderCredential;
  showSecret: boolean;
  isSaving: boolean;
  isTesting: boolean;
  isDeleting: boolean;
  status: 'none' | 'pending' | 'valid' | 'invalid';
  lastTested?: string;
}

type ProvidersState = Record<string, ProviderState>;

const initialProviderState: ProviderState = {
  credentials: { apiKey: '', apiSecret: '', testnet: false },
  showSecret: false,
  isSaving: false,
  isTesting: false,
  isDeleting: false,
  status: 'none',
};

export default function CredentialsPage() {
  const { toast } = useToast();
  const [providers, setProviders] = useState<ProvidersState>(() =>
    PROVIDERS.reduce(
      (acc, p) => ({ ...acc, [p.id]: { ...initialProviderState } }),
      {}
    )
  );
  const [isLoading, setIsLoading] = useState(true);

  // Fetch existing credentials on mount
  useEffect(() => {
    fetchCredentials();
  }, []);

  const fetchCredentials = async () => {
    try {
      const response = await fetch(`${API_BASE}/credentials`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      });
      if (response.ok) {
        const data = await response.json();
        // Update state with fetched credentials
        Object.entries(data.credentials || {}).forEach(([provider, creds]) => {
          setProviders((prev) => ({
            ...prev,
            [provider]: {
              ...prev[provider],
              credentials: {
                apiKey: '••••••••', // Masked
                apiSecret: '••••••••',
                testnet: (creds as any)[0]?.metadata?.testnet || false,
              },
              status: (creds as any)[0]?.validationStatus || 'pending',
            },
          }));
        });
      }
    } catch (error) {
      console.error('Failed to fetch credentials:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateProvider = (providerId: string, updates: Partial<ProviderState>) => {
    setProviders((prev) => ({
      ...prev,
      [providerId]: { ...prev[providerId], ...updates },
    }));
  };

  const updateCredentials = (
    providerId: string,
    field: keyof ProviderCredential,
    value: string | boolean
  ) => {
    setProviders((prev) => ({
      ...prev,
      [providerId]: {
        ...prev[providerId],
        credentials: { ...prev[providerId].credentials, [field]: value },
      },
    }));
  };

  const saveCredentials = async (providerId: string) => {
    updateProvider(providerId, { isSaving: true });

    try {
      const state = providers[providerId];
      const response = await fetch(`${API_BASE}/credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          provider: providerId,
          credentials: {
            apiKey: state.credentials.apiKey,
            apiSecret: state.credentials.apiSecret || undefined,
          },
          metadata: { testnet: state.credentials.testnet },
        }),
      });

      if (response.ok) {
        toast({
          title: 'Credentials Saved',
          description: `${providerId} credentials have been securely stored.`,
        });
        updateProvider(providerId, { status: 'pending' });
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save');
      }
    } catch (error) {
      toast({
        title: 'Save Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      updateProvider(providerId, { isSaving: false });
    }
  };

  const testConnection = async (providerId: string) => {
    updateProvider(providerId, { isTesting: true });

    try {
      const response = await fetch(`${API_BASE}/credentials/${providerId}/test`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Connection Successful',
          description: result.message || `${providerId} connection verified.`,
        });
        updateProvider(providerId, {
          status: 'valid',
          lastTested: new Date().toISOString(),
        });
      } else {
        toast({
          title: 'Connection Failed',
          description: result.message || 'Invalid credentials',
          variant: 'destructive',
        });
        updateProvider(providerId, { status: 'invalid' });
      }
    } catch (error) {
      toast({
        title: 'Test Failed',
        description: 'Network error',
        variant: 'destructive',
      });
    } finally {
      updateProvider(providerId, { isTesting: false });
    }
  };

  const deleteCredentials = async (providerId: string) => {
    updateProvider(providerId, { isDeleting: true });

    try {
      const response = await fetch(`${API_BASE}/credentials/${providerId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });

      if (response.ok) {
        toast({
          title: 'Credentials Deleted',
          description: `${providerId} credentials have been removed.`,
        });
        updateProvider(providerId, {
          ...initialProviderState,
          isDeleting: false,
        });
      }
    } catch (error) {
      toast({
        title: 'Delete Failed',
        description: 'Could not delete credentials',
        variant: 'destructive',
      });
      updateProvider(providerId, { isDeleting: false });
    }
  };

  const getStatusBadge = (status: ProviderState['status']) => {
    switch (status) {
      case 'valid':
        return (
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
            <CheckCircle className="w-3 h-3 mr-1" /> Connected
          </Badge>
        );
      case 'invalid':
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
            <XCircle className="w-3 h-3 mr-1" /> Invalid
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
            <RefreshCw className="w-3 h-3 mr-1" /> Pending Test
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">
            Not Configured
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
          <Key className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">API Credentials</h1>
          <p className="text-muted-foreground">
            Securely manage your exchange and service API keys
          </p>
        </div>
      </div>

      {/* Security Notice */}
      <Card className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/30">
        <CardContent className="flex items-center gap-3 py-4">
          <Shield className="w-5 h-5 text-blue-400" />
          <p className="text-sm text-muted-foreground">
            All credentials are encrypted with AES-256-GCM and stored securely.
            Access is audit-logged.
          </p>
        </CardContent>
      </Card>

      {/* Exchange Credentials */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Exchange Connections</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {PROVIDERS.filter((p) => p.category === 'exchange').map((provider) => {
            const state = providers[provider.id];
            return (
              <Card key={provider.id} className="relative overflow-hidden">
                <div
                  className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${provider.color}`}
                />
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{provider.icon}</span>
                      <div>
                        <CardTitle className="text-lg">{provider.name}</CardTitle>
                        <CardDescription>{provider.description}</CardDescription>
                      </div>
                    </div>
                    {getStatusBadge(state.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* API Key */}
                  <div className="space-y-2">
                    <Label htmlFor={`${provider.id}-key`}>API Key</Label>
                    <Input
                      id={`${provider.id}-key`}
                      type="text"
                      placeholder="Enter API key"
                      value={state.credentials.apiKey}
                      onChange={(e) =>
                        updateCredentials(provider.id, 'apiKey', e.target.value)
                      }
                      className="font-mono"
                    />
                  </div>

                  {/* API Secret */}
                  {provider.secretLabel && (
                    <div className="space-y-2">
                      <Label htmlFor={`${provider.id}-secret`}>
                        {provider.secretLabel}
                      </Label>
                      <div className="relative">
                        <Input
                          id={`${provider.id}-secret`}
                          type={state.showSecret ? 'text' : 'password'}
                          placeholder={`Enter ${provider.secretLabel.toLowerCase()}`}
                          value={state.credentials.apiSecret}
                          onChange={(e) =>
                            updateCredentials(provider.id, 'apiSecret', e.target.value)
                          }
                          className="font-mono pr-10"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full"
                          onClick={() =>
                            updateProvider(provider.id, {
                              showSecret: !state.showSecret,
                            })
                          }
                        >
                          {state.showSecret ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Testnet Toggle */}
                  {provider.hasTestnet && (
                    <div className="flex items-center justify-between py-2">
                      <Label htmlFor={`${provider.id}-testnet`}>Testnet Mode</Label>
                      <Switch
                        id={`${provider.id}-testnet`}
                        checked={state.credentials.testnet}
                        onCheckedChange={(checked) =>
                          updateCredentials(provider.id, 'testnet', checked)
                        }
                      />
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      className="flex-1"
                      onClick={() => saveCredentials(provider.id)}
                      disabled={state.isSaving || !state.credentials.apiKey}
                    >
                      {state.isSaving ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => testConnection(provider.id)}
                      disabled={state.isTesting || state.status === 'none'}
                    >
                      {state.isTesting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => deleteCredentials(provider.id)}
                      disabled={state.isDeleting || state.status === 'none'}
                    >
                      {state.isDeleting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* AI Services */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">AI Services</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {PROVIDERS.filter((p) => p.category === 'ai').map((provider) => {
            const state = providers[provider.id];
            return (
              <Card key={provider.id} className="relative overflow-hidden">
                <div
                  className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${provider.color}`}
                />
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{provider.icon}</span>
                      <div>
                        <CardTitle className="text-lg">{provider.name}</CardTitle>
                        <CardDescription>{provider.description}</CardDescription>
                      </div>
                    </div>
                    {getStatusBadge(state.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* API Key */}
                  <div className="space-y-2">
                    <Label htmlFor={`${provider.id}-key`}>API Key</Label>
                    <Input
                      id={`${provider.id}-key`}
                      type="text"
                      placeholder="Enter API key"
                      value={state.credentials.apiKey}
                      onChange={(e) =>
                        updateCredentials(provider.id, 'apiKey', e.target.value)
                      }
                      className="font-mono"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      className="flex-1"
                      onClick={() => saveCredentials(provider.id)}
                      disabled={state.isSaving || !state.credentials.apiKey}
                    >
                      {state.isSaving ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => testConnection(provider.id)}
                      disabled={state.isTesting || state.status === 'none'}
                    >
                      {state.isTesting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => deleteCredentials(provider.id)}
                      disabled={state.isDeleting || state.status === 'none'}
                    >
                      {state.isDeleting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
