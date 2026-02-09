import { useEffect } from 'react';
import { InspectorPanel } from '@/components/layout/InspectorPanel';
import { InspectorProvider, useInspector } from '@/context/InspectorContext';
import { DensityProvider } from '@/context/DensityContext';

function InspectorWindowContent() {
  const { setOpen } = useInspector();

  useEffect(() => {
    // Force open in the pop-out window
    setOpen(true);
    
    // Set title
    document.title = 'Mission Control — Titan Operator';
  }, [setOpen]);

  return (
    <div className="h-screen w-screen bg-background flex flex-col overflow-hidden">
       {/* 
         Pass mobile={true} to:
         1. Disable the drag handle (window is resizable)
         2. Force width: 100% to fill the window
         3. Hide the "Pop Out" button recursively
       */}
       <InspectorPanel mobile={true} /> 
    </div>
  );
}

export default function InspectorWindow() {
  return (
    <DensityProvider>
      <InspectorProvider>
         <InspectorWindowContent />
      </InspectorProvider>
    </DensityProvider>
  );
}
