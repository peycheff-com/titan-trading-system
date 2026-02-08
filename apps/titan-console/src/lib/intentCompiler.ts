/**
 * Intent Compiler
 *
 * Converts natural language operator commands into validated
 * OperatorIntentV1 payloads using pattern matching on a fixed
 * command vocabulary. No LLM in v1.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IntentType =
  | 'ARM'
  | 'DISARM'
  | 'SET_MODE'
  | 'THROTTLE_PHASE'
  | 'RUN_RECONCILE'
  | 'FLATTEN'
  | 'OVERRIDE_RISK';

export type DangerLevel = 'safe' | 'moderate' | 'critical';

export interface CompiledIntent {
  id: string;
  type: IntentType;
  params: Record<string, unknown>;
  dangerLevel: DangerLevel;
  description: string;
}

export interface CompileResult {
  matched: boolean;
  intent?: CompiledIntent;
  error?: string;
}

// ---------------------------------------------------------------------------
// Danger classification
// ---------------------------------------------------------------------------

const DANGER_MAP: Record<IntentType, DangerLevel> = {
  ARM: 'moderate',
  DISARM: 'safe',
  SET_MODE: 'moderate',
  THROTTLE_PHASE: 'moderate',
  RUN_RECONCILE: 'safe',
  FLATTEN: 'critical',
  OVERRIDE_RISK: 'critical',
};

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------

export type OperatorRole = 'observer' | 'operator' | 'risk_owner';

const ROLE_ALLOWED: Record<OperatorRole, IntentType[]> = {
  observer: [],
  operator: ['ARM', 'DISARM', 'SET_MODE', 'THROTTLE_PHASE', 'RUN_RECONCILE'],
  risk_owner: ['ARM', 'DISARM', 'SET_MODE', 'THROTTLE_PHASE', 'RUN_RECONCILE', 'FLATTEN', 'OVERRIDE_RISK'],
};

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

interface Pattern {
  regex: RegExp;
  type: IntentType;
  extract: (match: RegExpMatchArray) => Record<string, unknown>;
  describe: (params: Record<string, unknown>) => string;
}

const PATTERNS: Pattern[] = [
  {
    regex: /^(?:arm|arm\s+(?:the\s+)?system)$/i,
    type: 'ARM',
    extract: () => ({}),
    describe: () => 'Arm the system — enables dangerous controls',
  },
  {
    regex: /^(?:disarm|disarm\s+(?:the\s+)?system)$/i,
    type: 'DISARM',
    extract: () => ({}),
    describe: () => 'Disarm the system — disables dangerous controls',
  },
  {
    regex: /^set\s+mode\s+(paper|live-limited|live-full)$/i,
    type: 'SET_MODE',
    extract: (m) => ({ mode: m[1].toLowerCase() }),
    describe: (p) => `Set trading mode to ${p.mode}`,
  },
  {
    regex: /^throttle\s+(\w+)\s+(?:to\s+)?(\d+)%?$/i,
    type: 'THROTTLE_PHASE',
    extract: (m) => ({ phase: m[1].toLowerCase(), pct: parseInt(m[2], 10) }),
    describe: (p) => `Throttle ${p.phase} to ${p.pct}%`,
  },
  {
    regex: /^(?:reconcile|run\s+reconcile)$/i,
    type: 'RUN_RECONCILE',
    extract: () => ({}),
    describe: () => 'Run reconciliation check',
  },
  {
    regex: /^flatten\s+all$/i,
    type: 'FLATTEN',
    extract: () => ({}),
    describe: () => 'FLATTEN ALL — close all positions immediately',
  },
  {
    regex: /^flatten\s+(\w+)$/i,
    type: 'FLATTEN',
    extract: (m) => ({ symbol: m[1].toUpperCase() }),
    describe: (p) => `Flatten ${p.symbol} — close all ${p.symbol} positions`,
  },
  {
    regex: /^override\s+risk\s+(\w+)\s+(.+)$/i,
    type: 'OVERRIDE_RISK',
    extract: (m) => ({ key: m[1], value: m[2] }),
    describe: (p) => `Override risk parameter: ${p.key} = ${p.value}`,
  },
];

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

export function compileNLToIntent(
  input: string,
  role: OperatorRole = 'operator',
): CompileResult {
  const normalized = input.trim();
  if (!normalized) return { matched: false };

  for (const pattern of PATTERNS) {
    const match = normalized.match(pattern.regex);
    if (!match) continue;

    // RBAC pre-filter
    if (!ROLE_ALLOWED[role].includes(pattern.type)) {
      return {
        matched: true,
        error: `Role "${role}" cannot execute ${pattern.type}`,
      };
    }

    const params = pattern.extract(match);

    return {
      matched: true,
      intent: {
        id: crypto.randomUUID(),
        type: pattern.type,
        params,
        dangerLevel: DANGER_MAP[pattern.type],
        description: pattern.describe(params),
      },
    };
  }

  return { matched: false };
}

/** Default TTL per intent type (seconds) */
export const DEFAULT_TTL: Record<IntentType, number> = {
  ARM: 30,
  DISARM: 30,
  SET_MODE: 60,
  THROTTLE_PHASE: 60,
  RUN_RECONCILE: 120,
  FLATTEN: 30,
  OVERRIDE_RISK: 60,
};
