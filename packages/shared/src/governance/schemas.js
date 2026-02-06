import { z } from 'zod';
/**
 * Supported Proposal Types
 */
export var ProposalType;
(function (ProposalType) {
    ProposalType["PARAM_UPDATE"] = "PARAM_UPDATE";
    ProposalType["MODEL_PROMOTION"] = "MODEL_PROMOTION";
    ProposalType["EMERGENCY_ACTION"] = "EMERGENCY_ACTION";
    ProposalType["WHITELIST_UPDATE"] = "WHITELIST_UPDATE";
})(ProposalType || (ProposalType = {}));
/**
 * Base Schema for all Proposals
 */
export const baseProposalSchema = z.object({
    id: z.string().uuid(),
    author: z.string().min(1), // User ID or Agent ID
    title: z.string().min(5),
    description: z.string().min(10),
    timestamp: z.number(),
});
/**
 * Parameter Update Payload
 */
export const paramUpdatePayloadSchema = z.object({
    targetService: z.string(),
    parameterPath: z.string(),
    oldValue: z.unknown(),
    newValue: z.unknown(),
    reason: z.string(),
});
/**
 * Model Promotion Payload
 */
export const modelPromotionPayloadSchema = z.object({
    modelId: z.string(),
    version: z.string(),
    metrics: z.record(z.string(), z.number()),
    promotionReason: z.string(),
});
/**
 * Emergency Action Payload
 */
export const emergencyActionPayloadSchema = z.object({
    action: z.enum(['HALT_TRADING', 'CANCEL_ALL', 'REDUCE_ONLY', 'DISABLE_VENUE']),
    target: z.string().optional(), // Venue or Strategy ID
    reason: z.string(),
});
/**
 * Union of all payload types
 */
export const proposalPayloadSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal(ProposalType.PARAM_UPDATE),
        data: paramUpdatePayloadSchema,
    }),
    z.object({
        type: z.literal(ProposalType.MODEL_PROMOTION),
        data: modelPromotionPayloadSchema,
    }),
    z.object({
        type: z.literal(ProposalType.EMERGENCY_ACTION),
        data: emergencyActionPayloadSchema,
    }),
]);
/**
 * The Signed Envelope that the Brain verifies
 */
export const signedProposalSchema = z.object({
    payload: proposalPayloadSchema,
    metadata: baseProposalSchema,
    signature: z.string(), // Hex encoded Ed25519 signature
    publicKey: z.string(), // Hex encoded public key
});
//# sourceMappingURL=schemas.js.map