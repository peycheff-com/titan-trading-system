import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";

// Pages
import Overview from "@/pages/Overview";
import LiveOps from "@/pages/LiveOps";
import Scavenger from "@/pages/phases/Scavenger";
import Hunter from "@/pages/phases/Hunter";
import Sentinel from "@/pages/phases/Sentinel";
import Brain from "@/pages/organs/Brain";
import AIQuant from "@/pages/organs/AIQuant";
import Execution from "@/pages/organs/Execution";
import Journal from "@/pages/ops/Journal";
import Alerts from "@/pages/ops/Alerts";
import Infra from "@/pages/ops/Infra";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-right" />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            {/* Command */}
            <Route path="/" element={<Overview />} />
            <Route path="/live" element={<LiveOps />} />
            
            {/* Strategy Phases */}
            <Route path="/phases/scavenger" element={<Scavenger />} />
            <Route path="/phases/hunter" element={<Hunter />} />
            <Route path="/phases/sentinel" element={<Sentinel />} />
            
            {/* Organs */}
            <Route path="/brain" element={<Brain />} />
            <Route path="/ai-quant" element={<AIQuant />} />
            <Route path="/execution" element={<Execution />} />
            
            {/* Ops */}
            <Route path="/journal" element={<Journal />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/infra" element={<Infra />} />
          </Route>
          
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
