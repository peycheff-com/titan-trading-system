# M07 Audit Scope: AI Quant

> **Module**: `titan-ai-quant`
> **Type**: Service
> **Owner**: AI Agent (Antigravity)
> **Audit Date**: 2026-02-11

## 1. Overview
The `titan-ai-quant` module is a **Closed-Loop Parameter Optimization Engine**. It is responsible for autonomously tuning trading strategies using AI models (Google Generative AI) and backtesting simulations.

## 2. Core Responsibilities
-   **Parameter Optimization**: Adjusting strategy parameters based on performance metrics.
-   **Simulation**: Running backtests to validate parameter changes.
-   **AI Integration**: Interfacing with LLMs for strategic analysis.
-   **NATS Communication**: Listening for market events and publishing optimization results.

## 3. Interfaces
-   **Inputs**:
    -   NATS Subjects: `market.data.*`, `strategy.performance`
    -   Configuration: `config/` (JSON/Env)
-   **Outputs**:
    -   NATS Subjects: `optimization.result`, `ai.insight`
    -   Logs: Standard output / structured logs.

## 4. Dependencies
-   `@titan/shared`: Core utilities and types.
-   `@google/generative-ai`: AI model interaction.
-   `better-sqlite3`: Local state management.
-   `node-schedule`: Scheduled tasks.
