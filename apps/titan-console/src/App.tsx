import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { WebSocketProvider } from '@/context/WebSocketContext';
import { NotificationManager } from '@/components/titan/NotificationManager';
import { GenerativeUIProvider } from '@/components/generative/GenerativeUIProvider';

// Auth
import { useAuth, AuthProvider } from '@/context/AuthContext';
import { SafetyProvider } from '@/context/SafetyContext';
import Login from '@/pages/Login';

// Pages
import ChatOps from '@/pages/ChatOps';
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
                  <Routes>
                    {/* Public Route */}
                    <Route path="/login" element={<Login />} />

                    {/* Protected Routes */}
                    <Route element={<RequireAuth />}>
                      {/* ChatOps — default route */}
                      <Route path="/" element={<ChatOps />} />
                      <Route path="/overview" element={<Overview />} />
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
              </GenerativeUIProvider>
            </SafetyProvider>
          </WebSocketProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
