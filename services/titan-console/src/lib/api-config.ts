/**
 * API Configuration Utility
 * Centralizes URL inference for different environments
 */

const getDomain = () => {
  if (typeof window === 'undefined') return 'localhost';
  return window.location.hostname;
};

const isProduction = () => {
  const domain = getDomain();
  return domain.includes('railway.app') || domain.includes('titan-console');
};

export const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    const hostname = window.location.hostname;
    
    // If we're on a Railway production domain for the console
    if (hostname.includes('titan-console-production.up.railway.app')) {
      return origin.replace('titan-console-production', 'titan-execution-production');
    }
    
    // Generic fallback for Railway
    if (hostname.includes('railway.app')) {
       // Assume backend is on a similar named service if not specified
       return origin.replace('-console', '-execution');
    }
  }
  
  return "http://localhost:8080";
};

export const getWsBaseUrl = () => {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  
  const apiBase = getApiBaseUrl();
  return apiBase.replace(/^http/, 'ws');
};

export const getTitanExecutionUrl = () => {
  return import.meta.env.VITE_TITAN_EXECUTION_URL || getApiBaseUrl();
};
