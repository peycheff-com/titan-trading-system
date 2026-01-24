use crate::risk_guard::RiskGuard;
use crate::risk_policy::RiskState;
use tracing::warn;

pub struct SreMonitor;

impl SreMonitor {
    pub fn new() -> Self {
        Self
    }

    pub fn check_slos(&self, risk_guard: &RiskGuard) {
        let metric_families = prometheus::gather();
        for mf in metric_families {
            if mf.get_name() == "titan_execution_bulgaria_adverse_selection_bps" {
                for metric in mf.get_metric() {
                    let histogram = metric.get_histogram();
                    // Check bucket for > 20bps adverse selection
                    // Bounds are: ... 20.0, 50.0.
                    // The buckets are cumulative.
                    // We want count > 20bps.
                    // This is (Total Count) - (Count <= 20.0).

                    // Need to find bucket with upper_bound == 20.0.
                    let mut count_le_20 = 0;
                    let total_count = histogram.get_sample_count();

                    for b in histogram.get_bucket() {
                        if (b.get_upper_bound() - 20.0).abs() < 0.001 {
                            count_le_20 = b.get_cumulative_count();
                            break;
                        }
                    }

                    let bad_fills = total_count - count_le_20;
                    if bad_fills > 0 && total_count > 10 {
                        let bad_pct = (bad_fills as f64) / (total_count as f64);
                        if bad_pct > 0.05 {
                            // > 5% of fills are > 20bps adverse
                            warn!("SRE ALERT: 🇧🇬 Bulgaria Metric Spike! {:.2}% fills have >20bps adverse selection", bad_pct * 100.0);
                            // Escalate to Cautious if Normal
                            let current = risk_guard.get_policy().current_state;
                            if current == RiskState::Normal {
                                warn!("SRE Escalation: Normal -> Cautious");
                                risk_guard.update_risk_state(RiskState::Cautious);
                            }
                        }
                    }
                }
            }
        }
    }
}
