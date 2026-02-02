# Legal, Compliance, and Intended Use

## Summary

Titan is designed for research, backtesting, and internal evaluation. Live trading is supported
only for authorized operators after legal, compliance, and security review. This document
clarifies the permitted use cases and compliance posture referenced by the root README.

This document is not legal advice.

## Permitted Use Cases

- Research and simulation (offline analysis, synthetic data)
- Paper trading and sandbox exchange testing
- Production trading by approved operators within compliant jurisdictions

## Prohibited or Restricted Use Cases (Without Approvals)

- Offering Titan as a managed service to third parties without appropriate licenses
- Trading in jurisdictions where derivatives or perpetual products are restricted
- Using Titan for customer funds without required registrations, disclosures, or approvals

## Regulatory Considerations (High-Level)

Consult qualified counsel for your jurisdiction. Common considerations include:

- **Trading on behalf of others**: May require registration as a commodity trading advisor (CTA),
  commodity pool operator (CPO), investment adviser, broker-dealer, or local equivalent.
- **Derivatives and leverage**: Perpetual futures and leverage may be restricted for retail
  customers or in certain regions.
- **Exchange terms**: API usage, rate limits, and market-making restrictions must be honored.
- **AML/KYC**: If the system touches customer assets or custody, AML/KYC obligations may apply.
- **Data privacy**: If user data is collected, GDPR/CCPA or local privacy requirements apply.

## Required Approvals Before Production

1. Legal and compliance review for target jurisdiction(s)
2. Risk committee sign-off (limits, drawdown policy, kill switch)
3. Security review (secrets management, access control, audit logging)
4. Change management approval for deployment

## Alignment With Deployment Guidance

Production deployment steps in the root README assume the above approvals are complete.
If approvals are not complete, restrict usage to research and paper trading.

## Audit and Recordkeeping

Maintain audit logs for:
- Configuration changes (who/when/why)
- Operator actions in the Console
- Trade decisions, fills, and risk events

See `docs/operations/data-governance.md` for retention policy.
