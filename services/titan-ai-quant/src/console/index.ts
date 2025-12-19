/**
 * Console Components Index
 * 
 * Exports all console UI components for the AI Quant module.
 */

export { AIAdvisor, type AIAdvisorProps } from './AIAdvisor.js';
export { ProposalCard, type ProposalCardProps } from './ProposalCard.js';
export { TrapMonitorWithAI, type TrapMonitorWithAIProps } from './TrapMonitorWithAI.js';
export { 
  ChatInterface, 
  type ChatInterfaceProps, 
  type ChatMessage, 
  type ChatCommand,
  parseCommand,
  extractSymbolFromOptimizeCommand
} from './ChatInterface.js';
export { MorningBriefingDisplay, type MorningBriefingDisplayProps } from './MorningBriefingDisplay.js';
