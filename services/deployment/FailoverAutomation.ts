/**
 * Failover Automation System
 * 
 * Provides automated failover mechanisms for critical system components.
 * Handles decision making, execution, and validation of failover operations.
 * 
 * Requirements: 10.2
 */

import { EventEmitter } from 'events';
import { HotStandbyManager, StandbyComponent, ComponentHealth, FailoverEvent } from './HotStandbyManager';

export interface FailoverRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  conditions: FailoverCondition[];
  actions: FailoverAction[];
  priority: number;
  cooldownSeconds: number;
}

export interface FailoverCondition {
  type: 'health-check' | 'response-time' | 'error-rate' | 'sync-lag' | 'custom';
  component?: string;
  operator: 'equals' | 'not-equals' | 'greater-than' | 'less-than' | 'contains';
  value: any;
  duration?: number; // condition must be true for this many seconds
}

export interface FailoverAction {
  type: 'failover-component' | 'notify' | 'execute-script' | 'update-config';
  target: string;
  parameters: Record<string, any>;
  timeout?: number;
}

export interface FailoverDecision {
  ruleId: string;
  component: string;
  reason: string;
  confidence: number; // 0-1
  recommendedAction: 'failover' | 'alert' | 'wait';
  conditions: ConditionEvaluation[];
}

export interface ConditionEvaluation {
  condition: FailoverCondition;
  result: boolean;
  actualValue: any;
  evaluatedAt: Date;
}

export interface FailoverExecution {
  id: string;
  ruleId: string;
  component: string;
  startTime: Date;
  endTime?: Date;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'rolled-back';
  actions: ActionExecution[];
  error?: string;
}

export interface ActionExecution {
  action: FailoverAction;
  startTime: Date;
  endTime?: Date;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export class FailoverAutomation extends EventEmitter {
  private standbyManager: HotStandbyManager;
  private rules: Map<string, FailoverRule> = new Map();
  private conditionHistory: Map<string, ConditionEvaluation[]> = new Map();
  private activeExecutions: Map<string, FailoverExecution> = new Map();
  private lastRuleExecution: Map<string, Date> = new Map();
  private evaluationInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(standbyManager: HotStandbyManager) {
    super();
    this.standbyManager = standbyManager;
    this.setupEventListeners();
  }

  /**
   * Start the failover automation system
   */
  public start(): void {
    if (this.isRunning) {
      return;
    }

    console.log('Starting failover automation system...');
    
    // Start periodic rule evaluation
    this.evaluationInterval = setInterval(() => {
      this.evaluateAllRules();
    }, 5000); // Evaluate every 5 seconds

    this.isRunning = true;
    this.emit('automation:started');
    console.log('Failover automation system started');
  }

  /**
   * Stop the failover automation system
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('Stopping failover automation system...');

    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = undefined;
    }

    this.isRunning = false;
    this.emit('automation:stopped');
    console.log('Failover automation system stopped');
  }

  /**
   * Add a failover rule
   */
  public addRule(rule: FailoverRule): void {
    this.validateRule(rule);
    this.rules.set(rule.id, rule);
    this.emit('rule:added', rule);
    console.log(`Added failover rule: ${rule.name}`);
  }

  /**
   * Remove a failover rule
   */
  public removeRule(ruleId: string): boolean {
    const removed = this.rules.delete(ruleId);
    if (removed) {
      this.emit('rule:removed', { ruleId });
      console.log(`Removed failover rule: ${ruleId}`);
    }
    return removed;
  }

  /**
   * Update a failover rule
   */
  public updateRule(ruleId: string, updates: Partial<FailoverRule>): void {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    const updatedRule = { ...rule, ...updates };
    this.validateRule(updatedRule);
    this.rules.set(ruleId, updatedRule);
    this.emit('rule:updated', updatedRule);
    console.log(`Updated failover rule: ${updatedRule.name}`);
  }

  /**
   * Get all failover rules
   */
  public getRules(): FailoverRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get a specific failover rule
   */
  public getRule(ruleId: string): FailoverRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Setup event listeners for standby manager
   */
  private setupEventListeners(): void {
    this.standbyManager.on('health:checked', (data) => {
      this.onHealthUpdate(data.component, data.health);
    });

    this.standbyManager.on('sync:checked', (data) => {
      this.onSyncUpdate(data.component, data.syncStatus);
    });

    this.standbyManager.on('failover:completed', (event: FailoverEvent) => {
      this.onFailoverCompleted(event);
    });
  }

  /**
   * Handle health update from standby manager
   */
  private onHealthUpdate(component: string, health: ComponentHealth): void {
    // Trigger immediate rule evaluation for this component
    this.evaluateRulesForComponent(component);
  }

  /**
   * Handle sync update from standby manager
   */
  private onSyncUpdate(component: string, syncStatus: any): void {
    // Trigger immediate rule evaluation for this component
    this.evaluateRulesForComponent(component);
  }

  /**
   * Handle completed failover
   */
  private onFailoverCompleted(event: FailoverEvent): void {
    // Update any active executions
    for (const execution of this.activeExecutions.values()) {
      if (execution.component === event.component && execution.status === 'executing') {
        execution.status = event.success ? 'completed' : 'failed';
        execution.endTime = new Date();
        if (!event.success) {
          execution.error = 'Failover failed';
        }
        this.emit('execution:completed', execution);
      }
    }
  }

  /**
   * Evaluate all failover rules
   */
  private async evaluateAllRules(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    const enabledRules = Array.from(this.rules.values()).filter(rule => rule.enabled);
    
    for (const rule of enabledRules) {
      try {
        await this.evaluateRule(rule);
      } catch (error) {
        this.emit('rule:evaluation-error', {
          ruleId: rule.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Evaluate rules for a specific component
   */
  private async evaluateRulesForComponent(component: string): Promise<void> {
    const relevantRules = Array.from(this.rules.values()).filter(rule => 
      rule.enabled && rule.conditions.some(condition => 
        !condition.component || condition.component === component
      )
    );

    for (const rule of relevantRules) {
      try {
        await this.evaluateRule(rule);
      } catch (error) {
        this.emit('rule:evaluation-error', {
          ruleId: rule.id,
          component,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Evaluate a single failover rule
   */
  private async evaluateRule(rule: FailoverRule): Promise<void> {
    // Check cooldown period
    const lastExecution = this.lastRuleExecution.get(rule.id);
    if (lastExecution) {
      const timeSinceLastExecution = (Date.now() - lastExecution.getTime()) / 1000;
      if (timeSinceLastExecution < rule.cooldownSeconds) {
        return;
      }
    }

    // Evaluate all conditions
    const conditionEvaluations: ConditionEvaluation[] = [];
    let allConditionsMet = true;

    for (const condition of rule.conditions) {
      const evaluation = await this.evaluateCondition(condition);
      conditionEvaluations.push(evaluation);
      
      if (!evaluation.result) {
        allConditionsMet = false;
      }
    }

    // Store condition history
    const historyKey = `${rule.id}`;
    if (!this.conditionHistory.has(historyKey)) {
      this.conditionHistory.set(historyKey, []);
    }
    const history = this.conditionHistory.get(historyKey)!;
    history.push(...conditionEvaluations);
    
    // Keep only recent history (last 100 evaluations)
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }

    // Check if conditions have been met for required duration
    if (allConditionsMet && this.checkConditionDuration(rule, conditionEvaluations)) {
      const decision = this.makeFailoverDecision(rule, conditionEvaluations);
      
      if (decision.recommendedAction === 'failover') {
        await this.executeFailover(rule, decision);
      } else if (decision.recommendedAction === 'alert') {
        this.emit('failover:alert', decision);
      }
    }
  }

  /**
   * Evaluate a single condition
   */
  private async evaluateCondition(condition: FailoverCondition): Promise<ConditionEvaluation> {
    let actualValue: any;
    let result: boolean = false;

    try {
      switch (condition.type) {
        case 'health-check':
          actualValue = await this.evaluateHealthCondition(condition);
          break;
        
        case 'response-time':
          actualValue = await this.evaluateResponseTimeCondition(condition);
          break;
        
        case 'error-rate':
          actualValue = await this.evaluateErrorRateCondition(condition);
          break;
        
        case 'sync-lag':
          actualValue = await this.evaluateSyncLagCondition(condition);
          break;
        
        case 'custom':
          actualValue = await this.evaluateCustomCondition(condition);
          break;
        
        default:
          throw new Error(`Unsupported condition type: ${condition.type}`);
      }

      result = this.compareValues(actualValue, condition.operator, condition.value);

    } catch (error) {
      actualValue = null;
      result = false;
    }

    return {
      condition,
      result,
      actualValue,
      evaluatedAt: new Date()
    };
  }

  /**
   * Evaluate health condition
   */
  private async evaluateHealthCondition(condition: FailoverCondition): Promise<any> {
    if (!condition.component) {
      throw new Error('Component must be specified for health-check condition');
    }

    const health = this.standbyManager.getComponentHealth(condition.component);
    if (!health) {
      throw new Error(`Component health not found: ${condition.component}`);
    }

    return health.status;
  }

  /**
   * Evaluate response time condition
   */
  private async evaluateResponseTimeCondition(condition: FailoverCondition): Promise<any> {
    if (!condition.component) {
      throw new Error('Component must be specified for response-time condition');
    }

    const health = this.standbyManager.getComponentHealth(condition.component);
    if (!health) {
      throw new Error(`Component health not found: ${condition.component}`);
    }

    return health.responseTime;
  }

  /**
   * Evaluate error rate condition
   */
  private async evaluateErrorRateCondition(condition: FailoverCondition): Promise<any> {
    if (!condition.component) {
      throw new Error('Component must be specified for error-rate condition');
    }

    const health = this.standbyManager.getComponentHealth(condition.component);
    if (!health) {
      throw new Error(`Component health not found: ${condition.component}`);
    }

    // Calculate error rate based on consecutive failures
    const totalChecks = 10; // Assume last 10 checks
    const errorRate = health.consecutiveFailures / totalChecks;
    return errorRate;
  }

  /**
   * Evaluate sync lag condition
   */
  private async evaluateSyncLagCondition(condition: FailoverCondition): Promise<any> {
    if (!condition.component) {
      throw new Error('Component must be specified for sync-lag condition');
    }

    const health = this.standbyManager.getComponentHealth(condition.component);
    if (!health || !health.syncStatus) {
      throw new Error(`Component sync status not found: ${condition.component}`);
    }

    return health.syncStatus.lagSeconds;
  }

  /**
   * Evaluate custom condition
   */
  private async evaluateCustomCondition(condition: FailoverCondition): Promise<any> {
    // Implementation would depend on specific custom condition logic
    // This is a placeholder
    return condition.value;
  }

  /**
   * Compare values using the specified operator
   */
  private compareValues(actualValue: any, operator: string, expectedValue: any): boolean {
    switch (operator) {
      case 'equals':
        return actualValue === expectedValue;
      
      case 'not-equals':
        return actualValue !== expectedValue;
      
      case 'greater-than':
        return actualValue > expectedValue;
      
      case 'less-than':
        return actualValue < expectedValue;
      
      case 'contains':
        return String(actualValue).includes(String(expectedValue));
      
      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  }

  /**
   * Check if conditions have been met for required duration
   */
  private checkConditionDuration(rule: FailoverRule, evaluations: ConditionEvaluation[]): boolean {
    // For conditions with duration requirements, check historical data
    for (const condition of rule.conditions) {
      if (condition.duration && condition.duration > 0) {
        const historyKey = `${rule.id}`;
        const history = this.conditionHistory.get(historyKey) || [];
        
        // Check if condition has been true for the required duration
        const requiredDurationMs = condition.duration * 1000;
        const cutoffTime = new Date(Date.now() - requiredDurationMs);
        
        const recentEvaluations = history.filter(eval => 
          eval.evaluatedAt >= cutoffTime && 
          eval.condition.type === condition.type &&
          eval.condition.component === condition.component
        );

        const allTrue = recentEvaluations.every(eval => eval.result);
        if (!allTrue) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Make failover decision based on rule evaluation
   */
  private makeFailoverDecision(rule: FailoverRule, evaluations: ConditionEvaluation[]): FailoverDecision {
    // Determine the component to failover (from actions)
    const failoverAction = rule.actions.find(action => action.type === 'failover-component');
    const component = failoverAction?.target || 'unknown';

    // Calculate confidence based on condition results
    const trueConditions = evaluations.filter(eval => eval.result).length;
    const confidence = trueConditions / evaluations.length;

    // Determine recommended action based on rule priority and confidence
    let recommendedAction: 'failover' | 'alert' | 'wait' = 'wait';
    
    if (confidence >= 0.8 && rule.priority >= 8) {
      recommendedAction = 'failover';
    } else if (confidence >= 0.6) {
      recommendedAction = 'alert';
    }

    return {
      ruleId: rule.id,
      component,
      reason: `Rule "${rule.name}" conditions met`,
      confidence,
      recommendedAction,
      conditions: evaluations
    };
  }

  /**
   * Execute failover based on decision
   */
  private async executeFailover(rule: FailoverRule, decision: FailoverDecision): Promise<void> {
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const execution: FailoverExecution = {
      id: executionId,
      ruleId: rule.id,
      component: decision.component,
      startTime: new Date(),
      status: 'pending',
      actions: []
    };

    this.activeExecutions.set(executionId, execution);
    this.lastRuleExecution.set(rule.id, new Date());

    try {
      execution.status = 'executing';
      this.emit('execution:started', execution);

      // Execute all actions in the rule
      for (const action of rule.actions) {
        const actionExecution = await this.executeAction(action);
        execution.actions.push(actionExecution);
        
        if (actionExecution.status === 'failed') {
          throw new Error(`Action failed: ${actionExecution.error}`);
        }
      }

      execution.status = 'completed';
      execution.endTime = new Date();
      this.emit('execution:completed', execution);

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.error = error instanceof Error ? error.message : 'Unknown error';
      this.emit('execution:failed', execution);
    }
  }

  /**
   * Execute a single action
   */
  private async executeAction(action: FailoverAction): Promise<ActionExecution> {
    const actionExecution: ActionExecution = {
      action,
      startTime: new Date(),
      status: 'executing'
    };

    try {
      switch (action.type) {
        case 'failover-component':
          actionExecution.result = await this.executeFailoverAction(action);
          break;
        
        case 'notify':
          actionExecution.result = await this.executeNotifyAction(action);
          break;
        
        case 'execute-script':
          actionExecution.result = await this.executeScriptAction(action);
          break;
        
        case 'update-config':
          actionExecution.result = await this.executeUpdateConfigAction(action);
          break;
        
        default:
          throw new Error(`Unsupported action type: ${action.type}`);
      }

      actionExecution.status = 'completed';
      actionExecution.endTime = new Date();

    } catch (error) {
      actionExecution.status = 'failed';
      actionExecution.endTime = new Date();
      actionExecution.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return actionExecution;
  }

  /**
   * Execute failover action
   */
  private async executeFailoverAction(action: FailoverAction): Promise<any> {
    const reason = action.parameters.reason || 'Automated failover triggered by rule';
    return await this.standbyManager.manualFailover(action.target, reason);
  }

  /**
   * Execute notify action
   */
  private async executeNotifyAction(action: FailoverAction): Promise<any> {
    // Implementation would send notifications via configured channels
    console.log(`Notification: ${action.parameters.message}`);
    return { sent: true, timestamp: new Date() };
  }

  /**
   * Execute script action
   */
  private async executeScriptAction(action: FailoverAction): Promise<any> {
    // Implementation would execute the specified script
    console.log(`Executing script: ${action.parameters.script}`);
    return { executed: true, timestamp: new Date() };
  }

  /**
   * Execute update config action
   */
  private async executeUpdateConfigAction(action: FailoverAction): Promise<any> {
    // Implementation would update system configuration
    console.log(`Updating config: ${action.target}`);
    return { updated: true, timestamp: new Date() };
  }

  /**
   * Get active executions
   */
  public getActiveExecutions(): FailoverExecution[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Get execution history
   */
  public getExecutionHistory(limit: number = 50): FailoverExecution[] {
    // Implementation would return historical executions from storage
    return [];
  }

  /**
   * Validate a failover rule
   */
  private validateRule(rule: FailoverRule): void {
    if (!rule.id || !rule.name) {
      throw new Error('Rule must have id and name');
    }

    if (!rule.conditions || rule.conditions.length === 0) {
      throw new Error('Rule must have at least one condition');
    }

    if (!rule.actions || rule.actions.length === 0) {
      throw new Error('Rule must have at least one action');
    }

    if (rule.priority < 1 || rule.priority > 10) {
      throw new Error('Rule priority must be between 1 and 10');
    }
  }
}