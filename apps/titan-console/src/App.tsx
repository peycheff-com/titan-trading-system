import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { WebSocketProvider } from '@/context/WebSocketContext';
import { NotificationManager } from '@/components/titan/NotificationManager';
import { GenerativeUIProvider } from '@/components/generative/GenerativeUIProvider';
import { FF } from '@/config/featureFlags';

// CopilotKit — gated by feature flag
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

// Auth
import { useAuth, AuthProvider } from '@/context/AuthContext';
import { SafetyProvider } from '@/context/SafetyContext';
import Login from '@/pages/Login';

// Pages
import Overview from '@/pages/Overview';
import LiveOps from '@/pages/LiveOps';
import TradeControl from '@/pages/ops/TradeControl';
import TradeHistory from '@/pages/ops/TradeHistory';
import RiskPage from '@/pages/ops/Risk';
import Scavenger from '@/pages/phases/Scavenger';
import Hunter from '@/pages/phases/Hunter';
import Sentinel from '@/pages/phases/Sentinel';
import Brain from '@/pages/organs/Brain';
import AIQuant from '@/pages/organs/AIQuant';
import Execution from '@/pages/organs/Execution';
import DecisionLog from '@/pages/organs/DecisionLog';
import Journal from '@/pages/ops/Journal';
import Alerts from '@/pages/ops/Alerts';
import Infra from '@/pages/ops/Infra';
import PowerLaw from '@/pages/ops/PowerLaw';
import ConfigCenter from '@/pages/ops/ConfigCenter';
import Venues from '@/pages/ops/Venues';
import SettingsPage from '@/pages/Settings';
import CredentialsPage from '@/pages/Credentials';
import NotFound from '@/pages/NotFound';

const queryClient = new QueryClient();

// Auth Guard — redirects to /login if not authenticated
const RequireAuth = () => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <AppShell />;
};

/**
 * Conditionally wrap children in CopilotKit or pass through.
 * Controlled by FF.COPILOTKIT_SIDEBAR.
 */
function MaybeCopilot({ children }: { children: React.ReactNode }) {
  if (!FF.COPILOTKIT_SIDEBAR) return <>{children}</>;
  return (
    <CopilotKit runtimeUrl="http://localhost:8090/copilotkit">
      <CopilotSidebar
        instructions="You are Titan, a bio-mimetic trading assistant."
        defaultOpen={false}
        labels={{
          title: "Titan Memory Organ",
          initial: "Memory Organ online. How can I assist?",
        }}
      >
        {children}
      </CopilotSidebar>
    </CopilotKit>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <WebSocketProvider>
            <SafetyProvider>
              <NotificationManager />
              <GenerativeUIProvider>
                <MaybeCopilot>
                  <Routes>
                    {/* Public Route */}
                    <Route path="/login" element={<Login />} />

                    {/* Protected Routes */}
                    <Route element={<RequireAuth />}>
                      {/* Command */}
                      <Route path="/" element={<Overview />} />
                      <Route path="/live" element={<LiveOps />} />
                      <Route path="/trade" element={<TradeControl />} />
                      <Route path="/risk" element={<RiskPage />} />

                      {/* Strategy Phases */}
                      <Route path="/phases/scavenger" element={<Scavenger />} />
                      <Route path="/phases/hunter" element={<Hunter />} />
                      <Route path="/phases/sentinel" element={<Sentinel />} />

                      {/* Organs */}
                      <Route path="/brain" element={<Brain />} />
                      <Route path="/ai-quant" element={<AIQuant />} />
                      <Route path="/execution" element={<Execution />} />
                      <Route path="/decision-log" element={<DecisionLog />} />

                      {/* Ops */}
                      <Route path="/journal" element={<Journal />} />
                      <Route path="/history" element={<TradeHistory />} />
                      <Route path="/alerts" element={<Alerts />} />
                      <Route path="/infra" element={<Infra />} />
                      <Route path="/powerlaw" element={<PowerLaw />} />
                      <Route path="/config" element={<ConfigCenter />} />
                      <Route path="/venues" element={<Venues />} />
                      <Route path="/credentials" element={<CredentialsPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                    </Route>

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </MaybeCopilot>
              </GenerativeUIProvider>
            </SafetyProvider>
          </WebSocketProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
