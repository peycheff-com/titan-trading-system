import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { WebSocketProvider } from '@/context/WebSocketContext';
import { NotificationManager } from '@/components/titan/NotificationManager';
import { AttentionProvider } from '@/context/AttentionContext';
import { ReplayProvider } from '@/context/ReplayContext';

// Auth
import { useAuth, AuthProvider } from '@/context/AuthContext';
import { SafetyProvider } from '@/context/SafetyContext';
import Login from '@/pages/Login';

import InspectorWindow from '@/pages/InspectorWindow';
import { ModuleRegistryProvider } from '@/context/ModuleRegistryContext';
import { registry } from '@/modules';

const queryClient = new QueryClient();

// Auth Guard — redirects to /login if not authenticated
// Wrap children to support composition
const RequireAuth = ({ children }: { children?: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children ? <>{children}</> : <AppShell />;
};

const App = () => (
  <ModuleRegistryProvider value={registry}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <WebSocketProvider>
              <ReplayProvider>
                <AttentionProvider>
                  <SafetyProvider>
                    <NotificationManager />
                      <Routes>
                        {/* Public Route */}
                        <Route path="/login" element={<Login />} />

                        {/* Pop-out Inspector Window */}
                        <Route path="/inspector" element={
                          <RequireAuth>
                            <InspectorWindow />
                          </RequireAuth>
                        } />

                        {/*
                        * All protected routes go through AppShell.
                        * AppShell renders WorkspaceLayout which handles workspaces/tabs.
                        * The catch-all "/*" ensures any path loads the shell —
                        * workspace routing is internal (context + state, not URL routes).
                        */}
                        <Route path="/*" element={<RequireAuth />} />
                      </Routes>
                  </SafetyProvider>
                </AttentionProvider>
              </ReplayProvider>
            </WebSocketProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ModuleRegistryProvider>
);

export default App;
