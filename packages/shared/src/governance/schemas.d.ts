import { z } from 'zod';
/**
 * Supported Proposal Types
 */
export declare enum ProposalType {
    PARAM_UPDATE = "PARAM_UPDATE",
    MODEL_PROMOTION = "MODEL_PROMOTION",
    EMERGENCY_ACTION = "EMERGENCY_ACTION",
    WHITELIST_UPDATE = "WHITELIST_UPDATE"
}
/**
 * Base Schema for all Proposals
 */
export declare const baseProposalSchema: z.ZodObject<{
    id: z.ZodString;
    author: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    timestamp: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: string;
    timestamp: number;
    description: string;
    author: string;
    title: string;
}, {
    id: string;
    timestamp: number;
    description: string;
    author: string;
    title: string;
}>;
/**
 * Parameter Update Payload
 */
export declare const paramUpdatePayloadSchema: z.ZodObject<{
    targetService: z.ZodString;
    parameterPath: z.ZodString;
    oldValue: z.ZodUnknown;
    newValue: z.ZodUnknown;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    targetService: string;
    parameterPath: string;
    oldValue?: unknown;
    newValue?: unknown;
}, {
    reason: string;
    targetService: string;
    parameterPath: string;
    oldValue?: unknown;
    newValue?: unknown;
}>;
/**
 * Model Promotion Payload
 */
export declare const modelPromotionPayloadSchema: z.ZodObject<{
    modelId: z.ZodString;
    version: z.ZodString;
    metrics: z.ZodRecord<z.ZodString, z.ZodNumber>;
    promotionReason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    metrics: Record<string, number>;
    version: string;
    modelId: string;
    promotionReason: string;
}, {
    metrics: Record<string, number>;
    version: string;
    modelId: string;
    promotionReason: string;
}>;
/**
 * Emergency Action Payload
 */
export declare const emergencyActionPayloadSchema: z.ZodObject<{
    action: z.ZodEnum<["HALT_TRADING", "CANCEL_ALL", "REDUCE_ONLY", "DISABLE_VENUE"]>;
    target: z.ZodOptional<z.ZodString>;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    action: "HALT_TRADING" | "CANCEL_ALL" | "REDUCE_ONLY" | "DISABLE_VENUE";
    reason: string;
    target?: string | undefined;
}, {
    action: "HALT_TRADING" | "CANCEL_ALL" | "REDUCE_ONLY" | "DISABLE_VENUE";
    reason: string;
    target?: string | undefined;
}>;
/**
 * Union of all payload types
 */
export declare const proposalPayloadSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<ProposalType.PARAM_UPDATE>;
    data: z.ZodObject<{
        targetService: z.ZodString;
        parameterPath: z.ZodString;
        oldValue: z.ZodUnknown;
        newValue: z.ZodUnknown;
        reason: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        reason: string;
        targetService: string;
        parameterPath: string;
        oldValue?: unknown;
        newValue?: unknown;
    }, {
        reason: string;
        targetService: string;
        parameterPath: string;
        oldValue?: unknown;
        newValue?: unknown;
    }>;
}, "strip", z.ZodTypeAny, {
    type: ProposalType.PARAM_UPDATE;
    data: {
        reason: string;
        targetService: string;
        parameterPath: string;
        oldValue?: unknown;
        newValue?: unknown;
    };
}, {
    type: ProposalType.PARAM_UPDATE;
    data: {
        reason: string;
        targetService: string;
        parameterPath: string;
        oldValue?: unknown;
        newValue?: unknown;
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<ProposalType.MODEL_PROMOTION>;
    data: z.ZodObject<{
        modelId: z.ZodString;
        version: z.ZodString;
        metrics: z.ZodRecord<z.ZodString, z.ZodNumber>;
        promotionReason: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        metrics: Record<string, number>;
        version: string;
        modelId: string;
        promotionReason: string;
    }, {
        metrics: Record<string, number>;
        version: string;
        modelId: string;
        promotionReason: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: ProposalType.MODEL_PROMOTION;
    data: {
        metrics: Record<string, number>;
        version: string;
        modelId: string;
        promotionReason: string;
    };
}, {
    type: ProposalType.MODEL_PROMOTION;
    data: {
        metrics: Record<string, number>;
        version: string;
        modelId: string;
        promotionReason: string;
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<ProposalType.EMERGENCY_ACTION>;
    data: z.ZodObject<{
        action: z.ZodEnum<["HALT_TRADING", "CANCEL_ALL", "REDUCE_ONLY", "DISABLE_VENUE"]>;
        target: z.ZodOptional<z.ZodString>;
        reason: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        action: "HALT_TRADING" | "CANCEL_ALL" | "REDUCE_ONLY" | "DISABLE_VENUE";
        reason: string;
        target?: string | undefined;
    }, {
        action: "HALT_TRADING" | "CANCEL_ALL" | "REDUCE_ONLY" | "DISABLE_VENUE";
        reason: string;
        target?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    type: ProposalType.EMERGENCY_ACTION;
    data: {
        action: "HALT_TRADING" | "CANCEL_ALL" | "REDUCE_ONLY" | "DISABLE_VENUE";
        reason: string;
        target?: string | undefined;
    };
}, {
    type: ProposalType.EMERGENCY_ACTION;
    data: {
        action: "HALT_TRADING" | "CANCEL_ALL" | "REDUCE_ONLY" | "DISABLE_VENUE";
        reason: string;
        target?: string | undefined;
    };
}>]>;
/**
 * The Signed Envelope that the Brain verifies
 */
export declare const signedProposalSchema: z.ZodObject<{
    payload: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<ProposalType.PARAM_UPDATE>;
        data: z.ZodObject<{
            targetService: z.ZodString;
            parameterPath: z.ZodString;
            oldValue: z.ZodUnknown;
            newValue: z.ZodUnknown;
            reason: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            reason: string;
            targetService: string;
            parameterPath: string;
            oldValue?: unknown;
            newValue?: unknown;
        }, {
            reason: string;
            targetService: string;
            parameterPath: string;
            oldValue?: unknown;
            newValue?: unknown;
        }>;
    }, "strip", z.ZodTypeAny, {
        type: ProposalType.PARAM_UPDATE;
        data: {
            reason: string;
            targetService: string;
            parameterPath: string;
            oldValue?: unknown;
            newValue?: unknown;
        };
    }, {
        type: ProposalType.PARAM_UPDATE;
        data: {
            reason: string;
            targetService: string;
            parameterPath: string;
            oldValue?: unknown;
            newValue?: unknown;
        };
    }>, z.ZodObject<{
        type: z.ZodLiteral<ProposalType.MODEL_PROMOTION>;
        data: z.ZodObject<{
            modelId: z.ZodString;
            version: z.ZodString;
            metrics: z.ZodRecord<z.ZodString, z.ZodNumber>;
            promotionReason: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            metrics: Record<string, number>;
            version: string;
            modelId: string;
            promotionReason: string;
        }, {
            metrics: Record<string, number>;
            version: string;
            modelId: string;
            promotionReason: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        type: ProposalType.MODEL_PROMOTION;
        data: {
            metrics: Record<string, number>;
            version: string;
            modelId: string;
            promotionReason: string;
        };
    }, {
        type: ProposalType.MODEL_PROMOTION;
        data: {
            metrics: Record<string, number>;
            version: string;
            modelId: string;
            promotionReason: string;
        };
    }>, z.ZodObject<{
        type: z.ZodLiteral<ProposalType.EMERGENCY_ACTION>;
        data: z.ZodObject<{
            action: z.ZodEnum<["HALT_TRADING", "CANCEL_ALL", "REDUCE_ONLY", "DISABLE_VENUE"]>;
            target: z.ZodOptional<z.ZodString>;
            reason: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            action: "HALT_TRADING" | "CANCEL_ALL" | "REDUCE_ONLY" | "DISABLE_VENUE";
            reason: string;
            target?: string | undefined;
        }, {
            action: "HALT_TRADING" | "CANCEL_ALL" | "REDUCE_ONLY" | "DISABLE_VENUE";
            reason: string;
            target?: string | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        type: ProposalType.EMERGENCY_ACTION;
        data: {
            action: "HALT_TRADING" | "CANCEL_ALL" | "REDUCE_ONLY" | "DISABLE_VENUE";
            reason: string;
            target?: string | undefined;
        };
    }, {
        type: ProposalType.EMERGENCY_ACTION;
        data: {
            action: "HALT_TRADING" | "CANCEL_ALL" | "REDUCE_ONLY" | "DISABLE_VENUE";
            reason: string;
            target?: string | undefined;
        };
    }>]>;
    metadata: z.ZodObject<{
        id: z.ZodString;
        author: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        timestamp: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        id: string;
        timestamp: number;
        description: string;
        author: string;
        title: string;
    }, {
        id: string;
        timestamp: number;
        description: string;
        author: string;
        title: string;
    }>;
    signature: z.ZodString;
    publicKey: z.ZodString;
}, "strip", z.ZodTypeAny, {
    metadata: {
        id: string;
        timestamp: number;
        description: string;
        author: string;
        title: string;
    };
    payload: {
        type: ProposalType.PARAM_UPDATE;
        data: {
            reason: string;
            targetService: string;
            parameterPath: string;
            oldValue?: unknown;
            newValue?: unknown;
        };
    } | {
        type: ProposalType.MODEL_PROMOTION;
        data: {
            metrics: Record<string, number>;
            version: string;
            modelId: string;
            promotionReason: string;
        };
    } | {
        type: ProposalType.EMERGENCY_ACTION;
        data: {
            action: "HALT_TRADING" | "CANCEL_ALL" | "REDUCE_ONLY" | "DISABLE_VENUE";
            reason: string;
            target?: string | undefined;
        };
    };
    signature: string;
    publicKey: string;
}, {
    metadata: {
        id: string;
        timestamp: number;
        description: string;
        author: string;
        title: string;
    };
    payload: {
        type: ProposalType.PARAM_UPDATE;
        data: {
            reason: string;
            targetService: string;
            parameterPath: string;
            oldValue?: unknown;
            newValue?: unknown;
        };
    } | {
        type: ProposalType.MODEL_PROMOTION;
        data: {
            metrics: Record<string, number>;
            version: string;
            modelId: string;
            promotionReason: string;
        };
    } | {
        type: ProposalType.EMERGENCY_ACTION;
        data: {
            action: "HALT_TRADING" | "CANCEL_ALL" | "REDUCE_ONLY" | "DISABLE_VENUE";
            reason: string;
            target?: string | undefined;
        };
    };
    signature: string;
    publicKey: string;
}>;
export type ProposalPayload = z.infer<typeof proposalPayloadSchema>;
export type SignedProposal = z.infer<typeof signedProposalSchema>;
//# sourceMappingURL=schemas.d.ts.map