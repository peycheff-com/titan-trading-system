/**
 * AI Provider Module
 *
 * Unified AI provider abstraction for Titan Trading System.
 * Supports Kimi K2.5 (primary) and Gemini (legacy) providers.
 *
 * @module @titan/shared/ai
 */
export type { AgentSwarmRequest, AgentSwarmResponse, AICompletionRequest, AICompletionResponse, AIMessage, AIMessageContent, AIProvider, AIProviderConfig, AIProviderType, AITool, AIToolCall, AIToolResult, GeminiConfig, KimiK2Config, SubAgentResult, VisualAnalysisRequest, VisualAnalysisResponse, } from './types.js';
export { KimiK2Provider } from './KimiK2Provider.js';
export { AIProviderChain, clearProviderRegistry, createProvider, createProviderChain, createProviderFromEnv, getAIProvider, } from './factory.js';
export type { AIProviderFactoryConfig } from './factory.js';
//# sourceMappingURL=index.d.ts.map