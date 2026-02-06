# AI Quant Pipeline

> **Status**: Canonical
> **Engine**: Google Gemini 2.0 Flash

Titan uses Generative AI not to *trade*, but to *optimize*. The AI is a Researcher, not a Trader.

## 1. The Loop

1.  **Data Ingestion**: `titan-ai-quant` ingests 30 days of trade logs (`fills` table) and market data.
2.  **Analysis**:
    - It computes "Actionable Discrepancies" (e.g., "Stop losses were too tight in clusters A, B, C").
    - It prompts Gemini 2.0: *"Given risk policy X and performance Y, suggest parameter Z modifications."*
3.  **Proposal**:
    - AI generates a `ParameterProposal` (JSON).
    - Example: `hunter.entry_threshold: 0.5 -> 0.55`.
4.  **Simulation**:
    - The Proposal is run through `titan-backtesting`.
5.  **Review**:
    - If Backtest > Baseline, likely candidate.
    - **Operator Step**: Human must review and click "Merge".

## 2. Safety Invariants

1.  **No Direct Control**: The AI cannot issue `titan.cmd.execution.place`. It never touches the order book.
2.  **Bounded Context**: The AI can only modify specific "Tunable Parameters" defined in the strategy schema. It cannot change the Risk Policy.
3.  **Deterministic output**: We set `temperature: 0` for analysis tasks to ensure reproducibility.
