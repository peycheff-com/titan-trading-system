/**
 * ProposalGateway Unit Tests
 *
 * Tests for AI proposal verification and authorization
 */

import { ProposalGateway } from "../../src/governance/ProposalGateway.js";

// Mock shared dependencies with inline factories for hoisting
jest.mock("@titan/shared", () => {
    const actual = jest.requireActual("@titan/shared");
    return {
        ...actual,
        signedProposalSchema: {
            safeParse: jest.fn(),
        },
        verifyObjectSignature: jest.fn(),
    };
});

// Import after mocking
import { signedProposalSchema, verifyObjectSignature } from "@titan/shared";

const mockSignedProposalSchema = signedProposalSchema as jest.Mocked<
    typeof signedProposalSchema
>;
const mockVerifyObjectSignature = verifyObjectSignature as jest.Mock;

const createMockLogger = () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
});

const createValidProposal = () => ({
    publicKey: "authorized-key-123",
    signature: "valid-signature",
    metadata: {
        id: "proposal-001",
        type: "PARAMETER_CHANGE",
    },
    payload: {
        type: "RISK_LIMIT_UPDATE",
        changes: { maxDrawdown: 0.1 },
    },
});

describe("ProposalGateway", () => {
    let gateway: ProposalGateway;
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLogger = createMockLogger();
        gateway = new ProposalGateway(mockLogger as any, [
            "authorized-key-123",
        ]);
    });

    describe("constructor", () => {
        it("should create gateway with logger and authorized keys", () => {
            expect(gateway).toBeDefined();
        });

        it("should create gateway with empty authorized keys", () => {
            const openGateway = new ProposalGateway(mockLogger as any);
            expect(openGateway).toBeDefined();
        });
    });

    describe("submit", () => {
        describe("schema validation", () => {
            it("should reject proposals with invalid schema", async () => {
                mockSignedProposalSchema.safeParse.mockReturnValue({
                    success: false,
                    error: { message: "Invalid schema" },
                } as any);

                const result = await gateway.submit({ invalid: "data" });

                expect(result.verdict).toBe("REJECTED");
                expect(result.reason).toBe("Schema validation failed");
                expect(result.proposalId).toBe("INVALID_SCHEMA");
                expect(mockLogger.warn).toHaveBeenCalledWith(
                    "Proposal Schema Validation Failed",
                    undefined,
                    expect.any(Object),
                );
            });
        });

        describe("authorization check", () => {
            it("should reject proposals from unauthorized keys", async () => {
                const proposal = createValidProposal();
                proposal.publicKey = "unauthorized-key";

                mockSignedProposalSchema.safeParse.mockReturnValue({
                    success: true,
                    data: proposal,
                } as any);

                const result = await gateway.submit(proposal);

                expect(result.verdict).toBe("REJECTED");
                expect(result.reason).toBe("UNAUTHORIZED_KEY");
                expect(mockLogger.warn).toHaveBeenCalledWith(
                    "Unauthorized Proposal Key",
                    undefined,
                    expect.objectContaining({ key: "unauthorized-key" }),
                );
            });

            it("should accept any key when no authorized keys configured", async () => {
                const openGateway = new ProposalGateway(mockLogger as any, []);
                const proposal = createValidProposal();
                proposal.publicKey = "any-key";

                mockSignedProposalSchema.safeParse.mockReturnValue({
                    success: true,
                    data: proposal,
                } as any);
                mockVerifyObjectSignature.mockReturnValue(true);

                const result = await openGateway.submit(proposal);

                expect(result.verdict).toBe("ACCEPTED");
            });
        });

        describe("signature verification", () => {
            it("should reject proposals with invalid signatures", async () => {
                const proposal = createValidProposal();

                mockSignedProposalSchema.safeParse.mockReturnValue({
                    success: true,
                    data: proposal,
                } as any);
                mockVerifyObjectSignature.mockReturnValue(false);

                const result = await gateway.submit(proposal);

                expect(result.verdict).toBe("REJECTED");
                expect(result.reason).toBe("INVALID_SIGNATURE");
                expect(mockLogger.warn).toHaveBeenCalledWith(
                    "Proposal Signature Verification Failed",
                    undefined,
                    expect.objectContaining({ id: "proposal-001" }),
                );
            });

            it("should verify signature against payload and metadata combined", async () => {
                const proposal = createValidProposal();

                mockSignedProposalSchema.safeParse.mockReturnValue({
                    success: true,
                    data: proposal,
                } as any);
                mockVerifyObjectSignature.mockReturnValue(true);

                await gateway.submit(proposal);

                expect(mockVerifyObjectSignature).toHaveBeenCalledWith(
                    {
                        payload: proposal.payload,
                        metadata: proposal.metadata,
                    },
                    proposal.signature,
                    proposal.publicKey,
                );
            });
        });

        describe("successful submission", () => {
            it("should accept valid, authorized, signed proposals", async () => {
                const proposal = createValidProposal();

                mockSignedProposalSchema.safeParse.mockReturnValue({
                    success: true,
                    data: proposal,
                } as any);
                mockVerifyObjectSignature.mockReturnValue(true);

                const result = await gateway.submit(proposal);

                expect(result.verdict).toBe("ACCEPTED");
                expect(result.proposalId).toBe("proposal-001");
                expect(result.reason).toBe(
                    "Signature verified and key authorized.",
                );
                expect(result.executor).toBe("TitanBrain");
                expect(result.timestamp).toBeDefined();
                expect(mockLogger.info).toHaveBeenCalledWith(
                    "Proposal Verified and Accepted",
                    undefined,
                    expect.objectContaining({
                        id: "proposal-001",
                        type: "RISK_LIMIT_UPDATE",
                    }),
                );
            });
        });
    });

    describe("reject (internal)", () => {
        it("should format rejection decisions correctly", async () => {
            // Test via submit with invalid schema
            mockSignedProposalSchema.safeParse.mockReturnValue({
                success: false,
                error: {},
            } as any);

            const result = await gateway.submit({});

            expect(result).toEqual(
                expect.objectContaining({
                    proposalId: "INVALID_SCHEMA",
                    verdict: "REJECTED",
                    reason: "Schema validation failed",
                    executor: "TitanBrain",
                    timestamp: expect.any(Number),
                }),
            );
        });
    });
});
