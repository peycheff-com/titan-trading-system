import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { getApiBaseUrl } from '@/lib/api-config';

const API_BASE = getApiBaseUrl();
console.log('Titan Console: API_BASE is', API_BASE);

interface ApiOptions {
  method?: 'GET' | 'POST' | 'DELETE' | 'PUT';
  body?: any;
}

export function useTitanData() {
  const [loading, setLoading] = useState(false);

  const request = useCallback(async (endpoint: string, options: ApiOptions = {}) => {
    setLoading(true);
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API Request Failed:', error);
      toast.error(error instanceof Error ? error.message : 'Request failed');
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const getSystemStatus = useCallback(() => request('/api/status'), [request]);

  const toggleMasterArm = useCallback(
    (enabled: boolean) =>
      request(enabled ? '/api/auto-exec/enable' : '/api/auto-exec/disable', {
        method: 'POST',
        body: { operator_id: 'console_user' },
      }),
    [request],
  );

  const flattenAll = useCallback(
    () =>
      request('/api/emergency-flatten', {
        method: 'POST',
        body: { operator_id: 'console_user' },
      }),
    [request],
  );

  const cancelAll = useCallback(() => {
    console.warn('cancelAll not implemented in backend');
    return Promise.resolve(); // Placeholder
  }, []);

  return {
    loading,
    request,
    getSystemStatus,
    toggleMasterArm,
    flattenAll,
    cancelAll,
  };
}
