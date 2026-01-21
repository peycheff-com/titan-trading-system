# Quant Research and Strategy Promotion Workflow

This workflow defines how research progresses from idea to production across phase strategies and
AI Quant outputs.

## Lifecycle Stages

1. **Research**
   - Hypothesis, data selection, and feature engineering
   - Document expected edge and failure modes

2. **Backtest**
   - Use historical data and realistic execution assumptions
   - Include fees, slippage, and latency models
   - Produce a reproducible report in `artifacts/`

3. **Review**
   - Peer review of code, data assumptions, and results
   - Risk review for drawdowns, tail events, and leverage usage

4. **Paper Trading**
   - Deploy to sandbox exchanges or shadow execution
   - Validate signals, sizing, and operational safety

5. **Rollout**
   - Gradual allocation with capital limits
   - Monitor KPIs and rollback on regression

## AI Quant Outputs

AI Quant suggestions are **advisory** and must be validated before deployment:

- Reproduce outputs using deterministic backtests
- Validate out-of-sample performance (walk-forward or holdout)
- Stress-test against adverse regimes
- Check for overfitting and parameter instability
- Require human approval before promotion

## Promotion Checklist

- [ ] Backtest report stored and reproducible
- [ ] Risk review completed and signed off
- [ ] Paper trading results meet thresholds
- [ ] Monitoring alerts configured
- [ ] Rollback plan documented

## Ownership

- Strategy owners: Phase team leads
- Reviewers: Risk and platform operations
- Final approval: Trading operations manager
