import { z } from 'zod';
import { emergencyActionPayloadSchema, modelPromotionPayloadSchema, paramUpdatePayloadSchema, proposalPayloadSchema, ProposalType, signedProposalSchema } from './schemas.js';
export { ProposalType, signedProposalSchema };
export type SignedProposal = z.infer<typeof signedProposalSchema>;
export type ProposalPayload = z.infer<typeof proposalPayloadSchema>;
export type ParamUpdatePayload = z.infer<typeof paramUpdatePayloadSchema>;
export type ModelPromotionPayload = z.infer<typeof modelPromotionPayloadSchema>;
export type EmergencyActionPayload = z.infer<typeof emergencyActionPayloadSchema>;
export interface ProposalDecision {
    proposalId: string;
    verdict: 'ACCEPTED' | 'REJECTED';
    reason: string;
    timestamp: number;
    executor: string;
}
//# sourceMappingURL=types.d.ts.map