import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { WebSocketProvider } from '@/context/WebSocketContext';
import { NotificationManager } from '@/components/titan/NotificationManager';

// Pages
import Overview from '@/pages/Overview';
import LiveOps from '@/pages/LiveOps';
import TradeControl from '@/pages/ops/TradeControl';
import TradeHistory from '@/pages/ops/TradeHistory';
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
import SettingsPage from '@/pages/Settings';
import NotFound from '@/pages/NotFound';

const queryClient = new QueryClient();

import { useAuth, AuthProvider } from '@/context/AuthContext';
import { SafetyProvider } from '@/context/SafetyContext';
import Login from '@/pages/Login';
import { Navigate, Outlet } from 'react-router-dom';

// Auth Guard Component
const RequireAuth = () => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <AppLayout />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <AuthProvider>
          <WebSocketProvider>
            <SafetyProvider>
              <NotificationManager />
              <Routes>
                {/* Public Route */}
                <Route path="/login" element={<Login />} />

                {/* Protected Routes */}
                <Route element={<RequireAuth />}>
                  {/* Command */}
                  <Route path="/" element={<Overview />} />
                  <Route path="/live" element={<LiveOps />} />
                  <Route path="/trade" element={<TradeControl />} />

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
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </SafetyProvider>
          </WebSocketProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
