/**
 * API Configuration Utility
 * Centralizes URL inference for different environments
 */

const getDomain = () => {
  if (typeof window === "undefined") return "localhost";
  return window.location.hostname;
};

const isProduction = () => {
  const domain = getDomain();
  return domain.includes("ondigitalocean.app") ||
    domain.includes("titan-console");
};

export const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;

  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    const hostname = window.location.hostname;

    // If we're on a DigitalOcean production domain for the console
    if (hostname.includes("ondigitalocean.app")) {
      // Assume backend is on a similar named service
      return origin.replace("-console", "-execution");
    }
  }

  return "/api";
};

export const getWsBaseUrl = () => {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;

  const apiBase = getApiBaseUrl();
  if (apiBase.startsWith("/")) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}${apiBase}`;
  }
  return apiBase.replace(/^http/, "ws");
};

export const getTitanExecutionUrl = () => {
  // TODO: Phase 4: Proxy all execution requests through Brain
  // For now, if we must access execution directly, we need the API Key (which is not safe in client)
  // This function should eventually return the Brain URL for proxying.
  return import.meta.env.VITE_TITAN_EXECUTION_URL || "http://localhost:3002";
};

export const getTitanBrainUrl = () => {
  return import.meta.env.VITE_TITAN_BRAIN_URL || "http://localhost:3000";
};
