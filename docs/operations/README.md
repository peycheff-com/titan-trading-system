# Titan Trading System - Operational Documentation

This directory contains comprehensive operational documentation for deploying, configuring, monitoring, and maintaining the Titan Trading System in production environments.

## Documentation Structure

```
docs/operations/
├── README.md                           # This file - Operations overview
├── deployment/                         # Deployment guides and procedures
│   ├── getting-started.md              # Quick deployment guide
│   ├── production-deployment.md        # Production deployment procedures
│   ├── docker-deployment.md            # Docker containerization guide
│   ├── kubernetes-deployment.md        # Kubernetes deployment manifests
│   ├── aws-deployment.md               # AWS-specific deployment guide
│   └── configuration-management.md     # Configuration best practices
├── monitoring/                         # Monitoring and alerting setup
│   ├── prometheus-setup.md             # Prometheus metrics configuration
│   ├── grafana-dashboards.md           # Grafana dashboard setup
│   ├── alerting-rules.md               # Alert configuration and rules
│   ├── log-aggregation.md              # Centralized logging setup
│   └── health-monitoring.md            # Health check configuration
├── maintenance/                        # System maintenance procedures
│   ├── backup-procedures.md            # Database backup and recovery
│   ├── update-procedures.md            # System update procedures
│   ├── scaling-procedures.md           # Horizontal and vertical scaling
│   ├── performance-tuning.md           # Performance optimization guide
│   └── security-hardening.md           # Security configuration guide
├── troubleshooting/                    # Troubleshooting and incident response
│   ├── common-issues.md                # Common problems and solutions
│   ├── incident-response.md            # Incident response procedures
│   ├── diagnostic-tools.md             # Diagnostic and debugging tools
│   ├── performance-issues.md           # Performance troubleshooting
│   └── recovery-procedures.md          # Disaster recovery procedures
├── runbooks/                           # Operational runbooks
│   ├── daily-operations.md             # Daily operational checklist
│   ├── emergency-procedures.md         # Emergency response procedures
│   ├── circuit-breaker-management.md   # Circuit breaker operations
│   ├── position-management.md          # Position monitoring and control
│   └── configuration-changes.md        # Safe configuration change procedures
└── capacity-planning/                  # Capacity planning and scaling
    ├── resource-requirements.md        # System resource requirements
    ├── scaling-guidelines.md           # Scaling decision guidelines
    ├── performance-benchmarks.md       # Performance baseline metrics
    └── cost-optimization.md            # Cost optimization strategies
```

## Quick Start

### Prerequisites

Before deploying the Titan Trading System, ensure you have:

1. **Infrastructure Requirements**:
   - Linux server (Ubuntu 20.04+ or CentOS 8+)
   - Minimum 4 CPU cores, 8GB RAM, 100GB SSD
   - Network connectivity to trading exchanges
   - SSL certificates for HTTPS endpoints

2. **Software Dependencies**:
   - Node.js 18+ and npm
   - PostgreSQL 13+ (for Brain service)
   - Redis 6+ (for caching and IPC)
   - PM2 process manager
   - Nginx (reverse proxy)

3. **Trading Account Setup**:
   - Bybit API keys with trading permissions
   - MEXC API keys (optional, for backup execution)
   - Sufficient trading capital ($200+ for Phase 1)

### Basic Deployment

1. **Clone and Install**:
   ```bash
   git clone <repository-url> titan-trading
   cd titan-trading
   ./scripts/install-dependencies.sh
   ```

2. **Configure Environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

3. **Initialize Databases**:
   ```bash
   ./scripts/setup-databases.sh
   ```

4. **Start Services**:
   ```bash
   pm2 start ecosystem.config.js
   ```

5. **Verify Deployment**:
   ```bash
   ./scripts/health-check.sh
   ```

For detailed deployment instructions, see [deployment/getting-started.md](deployment/getting-started.md).

## Service Architecture

The Titan Trading System consists of 5 main services:

### Core Services

1. **Titan Brain** (Port 3100)
   - Master orchestrator and decision maker
   - Capital allocation and risk management
   - Phase coordination and signal approval
   - **Critical**: System cannot function without Brain

2. **Titan Execution** (Port 3002)
   - Order execution and position tracking
   - WebSocket communications hub
   - Shadow State management
   - **Critical**: Required for all trading operations

3. **Titan Console** (Port 3001)
   - Web-based monitoring dashboard
   - Real-time system visualization
   - Emergency control interface
   - **Important**: Required for operational visibility

### Trading Phases

4. **Titan Scavenger** (Port 8081)
   - Phase 1 trading engine ($200-$5K)
   - Predestination trap system
   - High-frequency scalping operations
   - **Optional**: Can be disabled if not using Phase 1

5. **Titan AI Quant** (Cron Job)
   - Offline parameter optimization
   - Machine learning analysis
   - Performance enhancement recommendations
   - **Optional**: Enhances performance but not required

### Supporting Infrastructure

- **PostgreSQL**: Brain data persistence
- **Redis**: Caching and inter-process communication
- **Nginx**: Reverse proxy and SSL termination
- **PM2**: Process management and monitoring

## Operational Responsibilities

### Daily Operations Team

**Trading Operations Manager**:
- Monitor system performance and trading results
- Review and approve AI optimization proposals
- Manage risk parameters and position limits
- Coordinate with development team on issues

**System Administrator**:
- Monitor system health and performance metrics
- Perform routine maintenance and updates
- Manage backups and disaster recovery
- Handle infrastructure scaling and optimization

**On-Call Engineer**:
- Respond to system alerts and incidents
- Perform emergency troubleshooting
- Execute emergency procedures (flatten positions, etc.)
- Escalate complex issues to development team

### Key Performance Indicators (KPIs)

**System Reliability**:
- Uptime: >99.9% (target: 99.95%)
- Signal processing latency: <100ms (95th percentile)
- WebSocket message delivery: <50ms (95th percentile)
- Database query response: <10ms (average)

**Trading Performance**:
- Position tracking accuracy: 100%
- Order execution success rate: >99.5%
- Risk limit compliance: 100%
- Circuit breaker false positives: <1 per month

**Operational Efficiency**:
- Mean Time to Detection (MTTD): <5 minutes
- Mean Time to Recovery (MTTR): <30 minutes
- Configuration change success rate: >99%
- Backup success rate: 100%

## Monitoring and Alerting

### Critical Alerts (Immediate Response Required)

1. **System Down**: Any core service unavailable
2. **Circuit Breaker Activated**: Trading halted due to risk limits
3. **Position Mismatch**: Shadow State vs exchange discrepancy
4. **Database Failure**: Data persistence issues
5. **Security Breach**: Unauthorized access attempts

### Warning Alerts (Response Within 1 Hour)

1. **High Latency**: Signal processing >200ms
2. **Memory Usage**: >80% memory utilization
3. **Disk Space**: <20% free space remaining
4. **API Rate Limits**: Approaching exchange limits
5. **WebSocket Disconnections**: Frequent reconnections

### Informational Alerts (Daily Review)

1. **Performance Metrics**: Daily trading summary
2. **System Updates**: Available software updates
3. **Capacity Planning**: Resource usage trends
4. **Optimization Opportunities**: AI recommendations

For detailed monitoring setup, see [monitoring/prometheus-setup.md](monitoring/prometheus-setup.md).

## Security Considerations

### Access Control

1. **Multi-Factor Authentication**: Required for all admin access
2. **Role-Based Access Control**: Separate permissions for different roles
3. **API Key Rotation**: Regular rotation of exchange API keys
4. **Network Security**: Firewall rules and VPN access

### Data Protection

1. **Encryption at Rest**: Database and configuration encryption
2. **Encryption in Transit**: TLS 1.3 for all communications
3. **Credential Management**: Secure storage of API keys and secrets
4. **Audit Logging**: Comprehensive logging of all operations

### Operational Security

1. **Change Management**: Controlled deployment procedures
2. **Incident Response**: Documented response procedures
3. **Backup Security**: Encrypted and geographically distributed backups
4. **Compliance**: Adherence to financial regulations

For detailed security procedures, see [maintenance/security-hardening.md](maintenance/security-hardening.md).

## Disaster Recovery

### Recovery Time Objectives (RTO)

- **Critical Services**: 15 minutes
- **Complete System**: 1 hour
- **Historical Data**: 4 hours

### Recovery Point Objectives (RPO)

- **Trading Data**: 1 minute (real-time replication)
- **Configuration**: 15 minutes (frequent backups)
- **Historical Analytics**: 1 hour (hourly backups)

### Backup Strategy

1. **Real-Time Replication**: Critical trading data
2. **Hourly Snapshots**: System configuration and state
3. **Daily Backups**: Complete system backup
4. **Weekly Archives**: Long-term data retention

For detailed recovery procedures, see [troubleshooting/recovery-procedures.md](troubleshooting/recovery-procedures.md).

## Capacity Planning

### Resource Scaling Triggers

**CPU Utilization**:
- Scale up: >70% for 15 minutes
- Scale down: <30% for 1 hour

**Memory Utilization**:
- Scale up: >80% for 5 minutes
- Scale down: <50% for 2 hours

**Network Throughput**:
- Scale up: >80% bandwidth for 10 minutes
- Monitor: WebSocket connection count

**Storage**:
- Alert: <20% free space
- Scale up: <10% free space

For detailed scaling procedures, see [capacity-planning/scaling-guidelines.md](capacity-planning/scaling-guidelines.md).

## Compliance and Auditing

### Regulatory Requirements

1. **Trade Reporting**: All trades logged with timestamps
2. **Risk Management**: Documented risk controls and limits
3. **Data Retention**: 7-year retention for trading records
4. **Audit Trail**: Complete audit trail for all operations

### Internal Controls

1. **Segregation of Duties**: Separate development and operations
2. **Change Control**: Documented change management process
3. **Access Reviews**: Quarterly access permission reviews
4. **Risk Assessments**: Annual risk assessment and mitigation

### Documentation Requirements

1. **Operational Procedures**: Up-to-date operational documentation
2. **Incident Reports**: Detailed incident analysis and remediation
3. **Performance Reports**: Monthly performance and reliability reports
4. **Compliance Reports**: Quarterly compliance assessment reports

## Support and Escalation

### Support Tiers

**Tier 1 - Operations Team**:
- System monitoring and basic troubleshooting
- Routine maintenance and configuration changes
- First-level incident response

**Tier 2 - Engineering Team**:
- Complex troubleshooting and system analysis
- Performance optimization and tuning
- Advanced configuration and customization

**Tier 3 - Development Team**:
- Code-level debugging and fixes
- Architecture changes and enhancements
- Critical system modifications

### Escalation Procedures

1. **Immediate Escalation** (Critical Issues):
   - System down or trading halted
   - Security incidents
   - Data corruption or loss

2. **Standard Escalation** (Within 4 Hours):
   - Performance degradation
   - Non-critical service failures
   - Configuration issues

3. **Planned Escalation** (Next Business Day):
   - Enhancement requests
   - Optimization opportunities
   - Documentation updates

## Getting Started

For new operators and administrators:

1. **Read the Quick Start Guide**: [deployment/getting-started.md](deployment/getting-started.md)
2. **Complete the Training Checklist**: [runbooks/daily-operations.md](runbooks/daily-operations.md)
3. **Review Emergency Procedures**: [runbooks/emergency-procedures.md](runbooks/emergency-procedures.md)
4. **Set Up Monitoring Access**: [monitoring/grafana-dashboards.md](monitoring/grafana-dashboards.md)
5. **Practice Incident Response**: [troubleshooting/incident-response.md](troubleshooting/incident-response.md)

## Additional Resources

- **API Documentation**: [../api/README.md](../api/README.md)
- **Development Guide**: [../development/README.md](../development/README.md)
- **Architecture Overview**: [../architecture/README.md](../architecture/README.md)
- **Security Guide**: [../security/README.md](../security/README.md)

---

This operational documentation is maintained by the Titan Operations Team and updated regularly to reflect current procedures and best practices.