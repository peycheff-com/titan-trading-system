import { DriftIncidentCard, DriftIncidentCardProps } from './DriftIncidentCard';
import { RiskGateDecisionCard, RiskGateDecisionCardProps } from './RiskGateDecisionCard';
import { FlattenProposalForm, FlattenProposalFormProps } from './FlattenProposalForm';

// Whitelist of allowed components
export const GEN_UI_REGISTRY = {
  DriftIncidentCard,
  RiskGateDecisionCard,
  FlattenProposalForm
};

export type GenUiComponent = keyof typeof GEN_UI_REGISTRY;

// This would ideally be a runtime Zod schema map
export const GEN_UI_SCHEMAS = {
    // defined elsewhere or inferred
};
