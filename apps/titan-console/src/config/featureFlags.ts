/**
 * Feature Flags
 *
 * These flags gate features during the migration to Operator OS.
 * Each flag must be removed before PR4 ships. No dormant flags in production.
 */

export const FF = {
  /** Gate CopilotKit sidebar (true = show CopilotKit, false = hide) */
  COPILOTKIT_SIDEBAR: false,

  /** Gate legacy direct API calls via getTitanExecutionUrl (true = allow, false = block) */
  LEGACY_API: true,

  /** Gate Inspector panel (true = show, false = hide) */
  INSPECTOR_PANEL: true,
} as const;

export type FeatureFlag = keyof typeof FF;
