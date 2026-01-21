use std::sync::Arc;
use parking_lot::RwLock;
use tracing::{info, warn};

use crate::context::{ExecutionContext, SimulatedTimeProvider};
use crate::pipeline::{ExecutionPipeline, PipelineResult};
use crate::shadow_state::{ShadowState, ExecutionEvent};
use crate::risk_guard::RiskGuard;
use crate::replay_model::ReplayEvent;
use crate::model::FillReport;

pub struct ReplayEngine {
    pipeline: Arc<ExecutionPipeline>,
    shadow_state: Arc<RwLock<ShadowState>>,
    risk_guard: Arc<RiskGuard>,
    time_provider: Arc<SimulatedTimeProvider>,
    ctx: Arc<ExecutionContext>,
    
    // Results
    pub fills: Vec<FillReport>,
    pub events: Vec<ExecutionEvent>,
}

impl ReplayEngine {
    pub fn new(
        pipeline: Arc<ExecutionPipeline>,
        shadow_state: Arc<RwLock<ShadowState>>,
        risk_guard: Arc<RiskGuard>,
        time_provider: Arc<SimulatedTimeProvider>,
        ctx: Arc<ExecutionContext>,
    ) -> Self {
        Self {
            pipeline,
            shadow_state,
            risk_guard,
            time_provider,
            ctx,
            fills: Vec::new(),
            events: Vec::new(),
        }
    }

    pub async fn run_event_loop(&mut self, events: impl Iterator<Item = ReplayEvent>) {
        info!("▶️ Starting Replay...");
        
        let mut count = 0;
        for event in events {
            count += 1;
            let ts = event.timestamp();
            
            // Advance time
            self.time_provider.set_time(ts);

            match event {
                ReplayEvent::Tick { .. } => {
                    // Just time advance
                },
                ReplayEvent::MarketData(ticker) => {
                    // Update valuation
                    let _exposure = {
                        let mut state = self.shadow_state.write();
                        state.update_valuation(&ticker);
                        state.calculate_exposure()
                    };
                    // In replay we might want to log exposure, but maybe not spam logs
                },
                ReplayEvent::RiskPolicy { policy, .. } => {
                    info!("🛡️ Updating Risk Policy");
                    self.risk_guard.update_policy(policy);
                },
                ReplayEvent::Signal(intent) => {
                    info!("📶 Processing Signal: {}", intent.signal_id);
                    
                    // Pipeline call
                    let result = self.pipeline.process_intent(intent.clone(), intent.signal_id.clone()).await;
                    
                    match result {
                        Ok(pipeline_result) => {
                            // Capture results
                            if let Some(_shadow_fill) = pipeline_result.shadow_fill {
                                // Shadow fill logic usually just logging
                            }
                            
                            self.events.extend(pipeline_result.events);
                            for (_, fill) in pipeline_result.fill_reports {
                                self.fills.push(fill);
                            }
                        },
                        Err(e) => {
                            warn!("❌ Pipeline Rejected/Failed: {}", e);
                            // Capture rejection??
                        }
                    }
                }
            }
            
            if count % 1000 == 0 {
                info!("Processed {} events...", count);
            }
        }
        
        info!("⏹️ Replay Finished. Processed {} events.", count);
    }
}
