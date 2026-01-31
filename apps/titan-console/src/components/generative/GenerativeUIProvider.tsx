import React from 'react';
import { useCopilotAction } from "@copilotkit/react-core";
import { GEN_UI_REGISTRY } from './registry';

// Re-export registry for convenience - Removed to fix Fast Refresh warning
// export { GEN_UI_REGISTRY };

export const GenerativeUIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  
  // Register DriftIncidentCard Action
  useCopilotAction({
    name: "DriftIncidentCard",
    description: "Displays a drift incident card to the operator.",
    parameters: [
      { name: "incidentId", type: "string" },
      { name: "asset", type: "string" },
      { name: "driftBps", type: "number" },
      { name: "hypothesis", type: "string" },
      { name: "evidenceLinks", type: "object[]" }, // Array of strings really
      { name: "recommendedAction", type: "string" },
    ],
    render: ({ args }: any) => {
      const Component = GEN_UI_REGISTRY.DriftIncidentCard;
      return <Component {...args} evidenceLinks={args.evidenceLinks || []} />;
    },
    handler: async () => {
        // No-op backend handler, we just render
        return "Displayed DriftIncidentCard";
    }
  });

  // Register RiskGateDecisionCard Action
  useCopilotAction({
    name: "RiskGateDecisionCard",
    description: "Displays a risk gate decision details.",
    parameters: [
      { name: "orderId", type: "string" },
      { name: "gateName", type: "string" },
      { name: "decision", type: "string", enum: ["REJECT", "APPROVED"] },
      { name: "reason", type: "string" },
      { name: "receiptJson", type: "string" },
    ],
    render: ({ args }: any) => {
        const Component = GEN_UI_REGISTRY.RiskGateDecisionCard;
        // Cast or validate props
        return <Component 
            orderId={args.orderId} 
            gateName={args.gateName} 
            decision={args.decision} 
            reason={args.reason}
            receiptJson={args.receiptJson}
        />;
    },
    handler: async () => {
        return "Displayed RiskGateDecisionCard";
    }
  });

  // Register FlattenProposalForm Action
  useCopilotAction({
    name: "FlattenProposalForm",
    description: "Drafts a flatten proposal for the operator.",
    parameters: [
        { name: "initialAsset", type: "string" },
        { name: "initialReason", type: "string" },
    ],
    render: ({ args }: any) => {
        const Component = GEN_UI_REGISTRY.FlattenProposalForm;
        return <Component 
            initialAsset={args.initialAsset}
            initialReason={args.initialReason}
            onPropose={(payload: any) => {
                console.log("Proposal Drafted:", payload);
                // In real implementation, this checks "Armed" mode.
                alert(`Proposal Drafted: Flatten ${payload.asset}\nReason: ${payload.reason}\n\n(Requires Confirmation + Armed Mode)`);
            }}
        />
    },
    handler: async () => {
        return "Displayed FlattenProposalForm";
    }
  });

  return <>{children}</>;
};
