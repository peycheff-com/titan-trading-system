import { ProposalDecision, signedProposalSchema } from '@titan/shared/dist/governance/types.js';
import { verifyObjectSignature } from '@titan/shared/dist/governance/crypto.js';
import { Logger } from '@titan/shared/dist/logger/Logger.js';

export class ProposalGateway {
  private logger: Logger;
  private authorizedKeys: Set<string>;

  constructor(logger: Logger, authorizedKeys: string[] = []) {
    this.logger = logger;
    this.authorizedKeys = new Set(authorizedKeys);
  }

  /**
   * Submit a proposal for verification and decision.
   */
  public async submit(proposal: unknown): Promise<ProposalDecision> {
    const timestamp = Date.now();

    // 1. Schema Validation
    const parseResult = signedProposalSchema.safeParse(proposal);
    if (!parseResult.success) {
      this.logger.warn('Proposal Schema Validation Failed', undefined, {
        error: parseResult.error,
      });
      return this.reject('INVALID_SCHEMA', 'Schema validation failed', timestamp);
    }

    const signedProposal = parseResult.data;

    // 2. Authorization Check (Is this key allowed to propose?)
    if (this.authorizedKeys.size > 0 && !this.authorizedKeys.has(signedProposal.publicKey)) {
      this.logger.warn('Unauthorized Proposal Key', undefined, {
        key: signedProposal.publicKey,
      });
      return this.reject(signedProposal.metadata.id, 'UNAUTHORIZED_KEY', timestamp);
    }

    // 3. Cryptographic Verification
    // Verify against the combination of payload and metadata to prevent metadata tampering
    const verificationTarget = {
      payload: signedProposal.payload,
      metadata: signedProposal.metadata,
    };

    const isValid = verifyObjectSignature(
      verificationTarget,
      signedProposal.signature,
      signedProposal.publicKey,
    );

    if (!isValid) {
      this.logger.warn('Proposal Signature Verification Failed', undefined, {
        id: signedProposal.metadata.id,
      });
      return this.reject(signedProposal.metadata.id, 'INVALID_SIGNATURE', timestamp);
    }

    // 4. Decision Logic (Auto-Approve for Phase 1)
    this.logger.info('Proposal Verified and Accepted', undefined, {
      id: signedProposal.metadata.id,
      type: signedProposal.payload.type,
    });

    return {
      proposalId: signedProposal.metadata.id,
      verdict: 'ACCEPTED',
      reason: 'Signature verified and key authorized.',
      timestamp,
      executor: 'TitanBrain',
    };
  }

  private reject(id: string, reason: string, timestamp: number): ProposalDecision {
    return {
      proposalId: id,
      verdict: 'REJECTED',
      reason,
      timestamp,
      executor: 'TitanBrain',
    };
  }
}
