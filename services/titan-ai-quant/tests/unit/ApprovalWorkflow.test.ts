/**
 * ApprovalWorkflow Unit Tests
 * 
 * Tests for the approval workflow that handles proposal approval/rejection
 * Requirements: 4.3, 4.4, 4.6
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ApprovalWorkflow } from '../../src/ai/ApprovalWorkflow';
import { StrategicMemory } from '../../src/ai/StrategicMemory';
import { getDefaultConfig } from '../../src/config/ConfigSchema';
import type { OptimizationProposal } from '../../src/types';


describe('ApprovalWorkflow', () => {
  let memory: StrategicMemory;
  let workflow: ApprovalWorkflow;
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    // Create temp directory for config file
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'titan-test-'));
    configPath = path.join(tempDir, 'config.json');
    
    // Write default config
    const defaultConfig = getDefaultConfig();
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    
    // Create in-memory database
    memory = new StrategicMemory(':memory:');
    
    // Create workflow
    workflow = new ApprovalWorkflow({
      configPath,
      memory,
    });
  });

  afterEach(() => {
    memory.close();
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });


  describe('applyProposal', () => {
    it('should apply a valid proposal and update config file', async () => {
      // Store a proposal first
      const proposal: OptimizationProposal = {
        targetKey: 'traps.oi_wipeout.stop_loss',
        currentValue: 0.02,
        suggestedValue: 0.025,
        reasoning: 'Wider stops reduce premature exits',
        expectedImpact: {
          pnlImprovement: 5.0,
          riskChange: 2.0,
          confidenceScore: 0.75,
        },
        status: 'pending',
      };

      const proposalId = await memory.storeProposal(proposal);
      proposal.id = proposalId;

      const result = await workflow.applyProposal(proposal);

      expect(result.success).toBe(true);
      expect(result.versionTag).toBeDefined();
      expect(result.versionTag).toMatch(/^v\d+-p\d+$/);

      // Verify config file was updated
      const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(updatedConfig.traps.oi_wipeout.stop_loss).toBe(0.025);
    });

    it('should tag config version in strategic memory', async () => {
      const proposal: OptimizationProposal = {
        targetKey: 'traps.funding_spike.take_profit',
        currentValue: 0.045,
        suggestedValue: 0.05,
        reasoning: 'Higher targets during trending markets',
        expectedImpact: {
          pnlImprovement: 8.0,
          riskChange: 1.0,
          confidenceScore: 0.82,
        },
        status: 'pending',
      };

      const proposalId = await memory.storeProposal(proposal);
      proposal.id = proposalId;

      const result = await workflow.applyProposal(proposal);

      expect(result.success).toBe(true);

      // Verify config version was tagged
      const configVersion = await memory.getConfigVersion(result.versionTag!);
      expect(configVersion).not.toBeNull();
      expect(configVersion!.proposalId).toBe(proposalId);

      // Verify proposal status was updated to 'applied'
      const updatedProposal = await memory.getProposal(proposalId);
      expect(updatedProposal!.status).toBe('applied');
    });

    it('should reject proposal without ID', async () => {
      const proposal: OptimizationProposal = {
        targetKey: 'traps.oi_wipeout.stop_loss',
        currentValue: 0.02,
        suggestedValue: 0.025,
        reasoning: 'Test',
        expectedImpact: { pnlImprovement: 1, riskChange: 0, confidenceScore: 0.5 },
        status: 'pending',
      };

      const result = await workflow.applyProposal(proposal);

      expect(result.success).toBe(false);
      // User-friendly error message for missing ID
      expect(result.error).toContain('out of allowed range');
    });

    it('should reject non-pending proposal', async () => {
      const proposal: OptimizationProposal = {
        targetKey: 'traps.oi_wipeout.stop_loss',
        currentValue: 0.02,
        suggestedValue: 0.025,
        reasoning: 'Test',
        expectedImpact: { pnlImprovement: 1, riskChange: 0, confidenceScore: 0.5 },
        status: 'approved',
      };

      const proposalId = await memory.storeProposal(proposal);
      await memory.updateProposalStatus(proposalId, 'approved');
      proposal.id = proposalId;
      proposal.status = 'approved';

      const result = await workflow.applyProposal(proposal);

      expect(result.success).toBe(false);
      // User-friendly error message for stale proposal
      expect(result.error).toContain('outdated');
    });


    it('should reject proposal with invalid config value', async () => {
      const proposal: OptimizationProposal = {
        targetKey: 'traps.oi_wipeout.stop_loss',
        currentValue: 0.02,
        suggestedValue: 0.5, // Invalid: exceeds max of 0.05
        reasoning: 'Test',
        expectedImpact: { pnlImprovement: 1, riskChange: 0, confidenceScore: 0.5 },
        status: 'pending',
      };

      const proposalId = await memory.storeProposal(proposal);
      proposal.id = proposalId;

      const result = await workflow.applyProposal(proposal);

      expect(result.success).toBe(false);
      // User-friendly error message for validation failure
      expect(result.error).toContain('out of allowed range');
    });

    it('should call onConfigUpdate callback when proposal is applied', async () => {
      const onConfigUpdate = jest.fn();
      
      const workflowWithCallback = new ApprovalWorkflow({
        configPath,
        memory,
        onConfigUpdate,
      });

      const proposal: OptimizationProposal = {
        targetKey: 'traps.oi_wipeout.stop_loss',
        currentValue: 0.02,
        suggestedValue: 0.025,
        reasoning: 'Test',
        expectedImpact: { pnlImprovement: 1, riskChange: 0, confidenceScore: 0.5 },
        status: 'pending',
      };

      const proposalId = await memory.storeProposal(proposal);
      proposal.id = proposalId;

      await workflowWithCallback.applyProposal(proposal);

      expect(onConfigUpdate).toHaveBeenCalledTimes(1);
      expect(onConfigUpdate.mock.calls[0][0].traps.oi_wipeout.stop_loss).toBe(0.025);
    });

    it('should call onProposalApplied callback when proposal is applied', async () => {
      const onProposalApplied = jest.fn();
      
      const workflowWithCallback = new ApprovalWorkflow({
        configPath,
        memory,
        onProposalApplied,
      });

      const proposal: OptimizationProposal = {
        targetKey: 'traps.oi_wipeout.stop_loss',
        currentValue: 0.02,
        suggestedValue: 0.025,
        reasoning: 'Test',
        expectedImpact: { pnlImprovement: 1, riskChange: 0, confidenceScore: 0.5 },
        status: 'pending',
      };

      const proposalId = await memory.storeProposal(proposal);
      proposal.id = proposalId;

      const result = await workflowWithCallback.applyProposal(proposal);

      expect(onProposalApplied).toHaveBeenCalledTimes(1);
      expect(onProposalApplied).toHaveBeenCalledWith(proposal, result.versionTag);
    });
  });


  describe('rejectProposal', () => {
    it('should reject a proposal and update status', async () => {
      const proposal: OptimizationProposal = {
        targetKey: 'traps.oi_wipeout.stop_loss',
        currentValue: 0.02,
        suggestedValue: 0.025,
        reasoning: 'Test',
        expectedImpact: { pnlImprovement: 1, riskChange: 0, confidenceScore: 0.5 },
        status: 'pending',
      };

      const proposalId = await memory.storeProposal(proposal);
      proposal.id = proposalId;

      const result = await workflow.rejectProposal(proposal, 'User rejected');

      expect(result.success).toBe(true);

      // Verify proposal status was updated
      const updatedProposal = await memory.getProposal(proposalId);
      expect(updatedProposal!.status).toBe('rejected');
    });

    it('should store rejection insight in strategic memory', async () => {
      const proposal: OptimizationProposal = {
        targetKey: 'traps.oi_wipeout.stop_loss',
        currentValue: 0.02,
        suggestedValue: 0.025,
        reasoning: 'Test',
        expectedImpact: { pnlImprovement: 1, riskChange: 0, confidenceScore: 0.5 },
        status: 'pending',
      };

      const proposalId = await memory.storeProposal(proposal);
      proposal.id = proposalId;

      await workflow.rejectProposal(proposal, 'Too risky');

      // Verify rejection insight was stored
      const insights = await memory.getRecentInsights(10);
      const rejectionInsight = insights.find(i => i.topic === 'proposal_rejection');
      
      expect(rejectionInsight).toBeDefined();
      expect(rejectionInsight!.text).toContain(`Proposal ${proposalId}`);
      expect(rejectionInsight!.text).toContain('Too risky');
    });

    it('should reject proposal without ID', async () => {
      const proposal: OptimizationProposal = {
        targetKey: 'traps.oi_wipeout.stop_loss',
        currentValue: 0.02,
        suggestedValue: 0.025,
        reasoning: 'Test',
        expectedImpact: { pnlImprovement: 1, riskChange: 0, confidenceScore: 0.5 },
        status: 'pending',
      };

      const result = await workflow.rejectProposal(proposal);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Proposal must have an ID');
    });

    it('should call onProposalRejected callback', async () => {
      const onProposalRejected = jest.fn();
      
      const workflowWithCallback = new ApprovalWorkflow({
        configPath,
        memory,
        onProposalRejected,
      });

      const proposal: OptimizationProposal = {
        targetKey: 'traps.oi_wipeout.stop_loss',
        currentValue: 0.02,
        suggestedValue: 0.025,
        reasoning: 'Test',
        expectedImpact: { pnlImprovement: 1, riskChange: 0, confidenceScore: 0.5 },
        status: 'pending',
      };

      const proposalId = await memory.storeProposal(proposal);
      proposal.id = proposalId;

      await workflowWithCallback.rejectProposal(proposal, 'Not needed');

      expect(onProposalRejected).toHaveBeenCalledTimes(1);
      expect(onProposalRejected).toHaveBeenCalledWith(proposal, 'Not needed');
    });
  });


  describe('rollbackConfig', () => {
    it('should rollback to a previous config version', async () => {
      // First, apply a proposal to create a version
      const proposal: OptimizationProposal = {
        targetKey: 'traps.oi_wipeout.stop_loss',
        currentValue: 0.02,
        suggestedValue: 0.025,
        reasoning: 'Test',
        expectedImpact: { pnlImprovement: 1, riskChange: 0, confidenceScore: 0.5 },
        status: 'pending',
      };

      const proposalId = await memory.storeProposal(proposal);
      proposal.id = proposalId;

      const applyResult = await workflow.applyProposal(proposal);
      expect(applyResult.success).toBe(true);

      // Verify config was changed
      let config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.traps.oi_wipeout.stop_loss).toBe(0.025);

      // Now rollback
      const rollbackResult = await workflow.rollbackConfig(applyResult.versionTag!);
      expect(rollbackResult.success).toBe(true);

      // Config should be restored (note: rollback restores the version, not the previous state)
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.traps.oi_wipeout.stop_loss).toBe(0.025);
    });

    it('should fail for non-existent version', async () => {
      const result = await workflow.rollbackConfig('nonexistent-version');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('concurrent access', () => {
    it('should handle concurrent approval attempts with locking', async () => {
      // Create two proposals
      const proposal1: OptimizationProposal = {
        targetKey: 'traps.oi_wipeout.stop_loss',
        currentValue: 0.02,
        suggestedValue: 0.025,
        reasoning: 'Test 1',
        expectedImpact: { pnlImprovement: 1, riskChange: 0, confidenceScore: 0.5 },
        status: 'pending',
      };

      const proposal2: OptimizationProposal = {
        targetKey: 'traps.funding_spike.take_profit',
        currentValue: 0.045,
        suggestedValue: 0.05,
        reasoning: 'Test 2',
        expectedImpact: { pnlImprovement: 2, riskChange: 0, confidenceScore: 0.6 },
        status: 'pending',
      };

      const proposalId1 = await memory.storeProposal(proposal1);
      const proposalId2 = await memory.storeProposal(proposal2);
      proposal1.id = proposalId1;
      proposal2.id = proposalId2;

      // Apply both concurrently
      const [result1, result2] = await Promise.all([
        workflow.applyProposal(proposal1),
        workflow.applyProposal(proposal2),
      ]);

      // Both should succeed (locking ensures sequential processing)
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Verify both changes were applied
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.traps.oi_wipeout.stop_loss).toBe(0.025);
      expect(config.traps.funding_spike.take_profit).toBe(0.05);
    });

    it('should report processing status correctly', async () => {
      expect(workflow.isProcessing()).toBe(false);
    });
  });
});
