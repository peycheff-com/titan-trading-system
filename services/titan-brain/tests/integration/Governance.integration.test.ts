import { Logger } from "@titan/shared";
import { ProposalGateway } from "../../src/governance/ProposalGateway.js";
import {
    generateKeyPair,
    signObject,
} from "@titan/shared";
import {
    ProposalType,
    SignedProposal,
} from "@titan/shared";

describe("ProposalGateway Integration", () => {
    let gateway: ProposalGateway;
    let logger: Logger;
    const adminKeys = generateKeyPair();
    const attackerKeys = generateKeyPair();

    beforeAll(() => {
        logger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        } as unknown as Logger;

        // Initialize gateway allowing admin key
        gateway = new ProposalGateway(logger, [adminKeys.publicKey]);
    });

    const createProposalRaw = () => ({
        type: ProposalType.PARAM_UPDATE,
        data: {
            targetService: "titan-execution",
            parameterPath: "risk.maxLeverage",
            oldValue: 10,
            newValue: 5,
            reason: "Reducing risk for weekend",
        },
    });

    const createSignedProposal = (
        keyPair: { publicKey: string; privateKey: string },
        payload: any = createProposalRaw(),
    ) => {
        const timestamp = Date.now();
        const metadata = {
            id: "00000000-0000-0000-0000-000000000000", // Valid UUID V0
            author: "admin_1",
            title: "Risk Reduction",
            description: "Reducing leverage to 5x",
            timestamp,
        };

        // Sign both payload and metadata to protect timestamp and author
        const signature = signObject({ payload, metadata }, keyPair.privateKey);

        return {
            payload,
            metadata,
            signature,
            publicKey: keyPair.publicKey,
        } as SignedProposal;
    };

    test("should accept a proposal signed by an authorized key", async () => {
        const proposal = createSignedProposal(adminKeys);
        // Use dynamic UUID for acceptance to avoid replay issues if logic enforced checks
        proposal.metadata.id = "11111111-1111-1111-1111-111111111111"; // Valid UUID
        // Re-sign because ID changed
        proposal.signature = signObject({
            payload: proposal.payload,
            metadata: proposal.metadata,
        }, adminKeys.privateKey);

        const decision = await gateway.submit(proposal);

        expect(decision.verdict).toBe("ACCEPTED");
        expect(decision.executor).toBe("TitanBrain");
    });

    test("should reject a proposal signed by an unauthorized key", async () => {
        const proposal = createSignedProposal(attackerKeys);
        proposal.metadata.id = "22222222-2222-2222-2222-222222222222";
        proposal.signature = signObject({
            payload: proposal.payload,
            metadata: proposal.metadata,
        }, attackerKeys.privateKey);

        const decision = await gateway.submit(proposal);

        expect(decision.verdict).toBe("REJECTED");
        expect(decision.reason).toBe("UNAUTHORIZED_KEY");
    });

    test("should reject a proposal with an invalid signature (tampered metadata)", async () => {
        const proposal = createSignedProposal(adminKeys);
        // Tamper with metadata (change ID to another valid UUID so schema passes, but signature verification fails)
        proposal.metadata.id = "33333333-3333-3333-3333-333333333333";

        const decision = await gateway.submit(proposal);

        expect(decision.verdict).toBe("REJECTED");
        expect(decision.reason).toBe("INVALID_SIGNATURE");
    });

    test("should reject a proposal with invalid schema", async () => {
        const proposal = createSignedProposal(adminKeys);
        // Corrupt schema
        (proposal as any).payload = { type: "UNKNOWN_TYPE" };

        const decision = await gateway.submit(proposal);

        expect(decision.verdict).toBe("REJECTED");
        // Logger check: (msg, context, meta)
        expect(logger.warn).toHaveBeenCalledWith(
            "Proposal Schema Validation Failed",
            undefined,
            expect.anything(),
        );
    });
});
