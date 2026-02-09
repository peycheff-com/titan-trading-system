/**
 * A2UI Renderer
 *
 * Takes a validated A2UISpec and renders components via a registry map.
 * Maps spec component types → existing canonical React components.
 *
 * Invalid spec → renders error fallback card with details (never blank).
 * Stable React keys from component index + type.
 */

import { type A2UISpec, type A2UIComponent } from '@/lib/a2ui/schema';
import { validateA2UISpec } from '@/lib/a2ui/validator';
import { cn } from '@/lib/utils';
import { AlertTriangle, ExternalLink } from 'lucide-react';

// ---------------------------------------------------------------------------
// Component Renderers
// ---------------------------------------------------------------------------

function renderActionCard(props: A2UIComponent & { type: 'ActionCard' }) {
  const { intentType, description, dangerLevel, params } = props.props;
  const dangerColor =
    dangerLevel === 'critical'
      ? 'border-status-critical/30 bg-status-critical/5'
      : dangerLevel === 'moderate'
        ? 'border-status-degraded/30 bg-status-degraded/5'
        : 'border-status-healthy/30 bg-status-healthy/5';

  return (
    <div className={cn('rounded-lg border p-3 text-xs', dangerColor)}>
      <div className="flex items-center gap-2 mb-2">
        <span className="font-semibold text-foreground">{intentType}</span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xxs font-medium uppercase',
            dangerLevel === 'critical'
              ? 'bg-status-critical/15 text-status-critical'
              : dangerLevel === 'moderate'
                ? 'bg-status-degraded/15 text-status-degraded'
                : 'bg-status-healthy/15 text-status-healthy',
          )}
        >
          {dangerLevel}
        </span>
      </div>
      <p className="text-muted-foreground mb-2">{description}</p>
      {Object.keys(params).length > 0 && (
        <div className="rounded-md border border-border/50 bg-background/50 p-2">
          {Object.entries(params).map(([key, value]) => (
            <div key={key} className="flex justify-between py-0.5">
              <span className="text-muted-foreground">{key}</span>
              <span className="font-mono text-foreground">{String(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function renderRiskDelta(props: A2UIComponent & { type: 'RiskDelta' }) {
  const { postureChange, affectedPhases, affectedSymbols, throttleDelta, capViolations } = props.props;
  return (
    <div className="rounded-md border border-border/50 bg-background/50 p-3 text-xs space-y-1.5">
      <span className="font-semibold text-xxs uppercase tracking-wider text-muted-foreground">Risk Delta</span>
      {postureChange && (
        <div className="text-foreground font-medium">Posture: {postureChange}</div>
      )}
      {affectedPhases.length > 0 && (
        <div className="text-muted-foreground">
          Phases: <span className="font-mono text-foreground">{affectedPhases.join(', ')}</span>
        </div>
      )}
      {affectedSymbols.length > 0 && (
        <div className="text-muted-foreground">
          Symbols: <span className="font-mono text-foreground">{affectedSymbols.join(', ')}</span>
        </div>
      )}
      {throttleDelta != null && (
        <div className="text-muted-foreground">
          Throttle:{' '}
          <span className={cn('font-mono font-medium', throttleDelta < 0 ? 'text-status-critical' : 'text-status-healthy')}>
            {throttleDelta > 0 ? '+' : ''}{throttleDelta}%
          </span>
        </div>
      )}
      {capViolations.length > 0 && (
        <div className="rounded-md bg-status-critical/10 p-2 text-status-critical">
          <p className="font-medium">Cap violations:</p>
          <ul className="mt-1 space-y-0.5">
            {capViolations.map((v, i) => <li key={i}>• {v}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function renderIntentTimeline(props: A2UIComponent & { type: 'IntentTimeline' }) {
  const { status, intentId } = props.props;
  return (
    <div className="rounded-md border border-border/50 bg-background/50 p-3 text-xs">
      <span className="font-semibold text-xxs uppercase tracking-wider text-muted-foreground">Intent Lifecycle</span>
      <div className="mt-1 flex items-center gap-2">
        <span className="font-mono text-foreground">{status}</span>
        {intentId && <span className="text-muted-foreground">#{intentId.slice(0, 8)}</span>}
      </div>
    </div>
  );
}

function renderDecisionTrace(props: A2UIComponent & { type: 'DecisionTrace' }) {
  const { decisionId, model, reasoning, confidence, factors } = props.props;
  return (
    <div className="rounded-md border border-border/50 bg-background/50 p-3 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-xxs uppercase tracking-wider text-muted-foreground">Decision Trace</span>
        <span className="font-mono text-muted-foreground">#{decisionId.slice(0, 8)}</span>
      </div>
      <div className="text-muted-foreground">Model: <span className="text-foreground">{model}</span></div>
      <div className="text-muted-foreground">Confidence: <span className="font-mono text-foreground">{(confidence * 100).toFixed(0)}%</span></div>
      <p className="text-foreground">{reasoning}</p>
      {factors.length > 0 && (
        <div className="space-y-0.5">
          {factors.map((f, i) => (
            <div key={i} className="flex justify-between">
              <span className="text-muted-foreground">{f.name} ({f.weight})</span>
              <span className="font-mono text-foreground">{f.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function renderArtifactLink(props: A2UIComponent & { type: 'ArtifactLink' }) {
  const { label, href, artifactType } = props.props;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-md border border-border/50 bg-background/50 px-3 py-2 text-xs text-primary hover:bg-muted transition-colors"
    >
      <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="font-medium">{label}</span>
      <span className="text-xxs text-muted-foreground uppercase">{artifactType}</span>
    </a>
  );
}

function renderPanelModule(props: A2UIComponent & { type: 'PanelModule' }) {
  const { title, content, variant } = props.props;
  const variantStyle =
    variant === 'critical'
      ? 'border-status-critical/30 bg-status-critical/5'
      : variant === 'warning'
        ? 'border-status-degraded/30 bg-status-degraded/5'
        : 'border-border bg-card';

  return (
    <div className={cn('rounded-lg border p-3 text-xs', variantStyle)}>
      <h4 className="font-semibold text-foreground mb-1">{title}</h4>
      <p className="text-muted-foreground whitespace-pre-wrap">{content}</p>
    </div>
  );
}

function renderText(props: A2UIComponent & { type: 'Text' }) {
  return <p className="text-sm text-foreground">{props.props.content}</p>;
}

// ---------------------------------------------------------------------------
// Component Registry
// ---------------------------------------------------------------------------

const COMPONENT_RENDERERS: Record<string, (component: A2UIComponent) => React.ReactNode> = {
  ActionCard: renderActionCard,
  RiskDelta: renderRiskDelta,
  IntentTimeline: renderIntentTimeline,
  DecisionTrace: renderDecisionTrace,
  ArtifactLink: renderArtifactLink,
  PanelModule: renderPanelModule,
  Text: renderText,
};

// ---------------------------------------------------------------------------
// Error Fallback
// ---------------------------------------------------------------------------

function ErrorFallback({ errors }: { errors: string[] }) {
  return (
    <div className="rounded-lg border border-status-degraded/30 bg-status-degraded/5 p-3 text-xs">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-4 w-4 text-status-degraded" />
        <span className="font-semibold text-status-degraded">Invalid UI Spec</span>
      </div>
      <ul className="space-y-0.5 text-status-degraded">
        {errors.slice(0, 5).map((err, i) => (
          <li key={i}>• {err}</li>
        ))}
        {errors.length > 5 && (
          <li className="text-muted-foreground">…and {errors.length - 5} more</li>
        )}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Renderer
// ---------------------------------------------------------------------------

interface A2UIRendererProps {
  /** Raw spec payload (will be validated) OR pre-validated spec */
  spec: A2UISpec | unknown;
  className?: string;
}

export function A2UIRenderer({ spec, className }: A2UIRendererProps) {
  // Validate at render time — safe for both pre-validated and raw payloads
  const result = validateA2UISpec(spec);

  if (result.valid === false) {
    return <ErrorFallback errors={result.errors} />;
  }

  const validSpec = result.spec;

  const { components, layout } = validSpec;

  return (
    <div
      className={cn(
        layout === 'grid-2' ? 'grid grid-cols-2 gap-3' : 'space-y-3',
        className,
      )}
    >
      {components.map((component, index) => {
        const renderer = COMPONENT_RENDERERS[component.type];
        if (!renderer) {
          return (
            <ErrorFallback
              key={`err-${index}`}
              errors={[`Unknown component type: ${component.type}`]}
            />
          );
        }
        return (
          <div key={`${component.type}-${index}`}>
            {renderer(component)}
          </div>
        );
      })}
    </div>
  );
}
