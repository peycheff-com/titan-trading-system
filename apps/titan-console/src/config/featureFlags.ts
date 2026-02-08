/**
 * Feature Flags
 *
 * These flags gate features during the migration to Operator OS.
 *
 * ⚠️ PR4: All migration flags have been expired.
 * COPILOTKIT_SIDEBAR: permanently OFF — CopilotKit replaced by native ChatTranscript
 * INSPECTOR_PANEL: permanently ON — no longer gated
 *
 * Remaining flag:
 * LEGACY_API: kept for PR3→PR4 transition, will be removed when
 *             all direct API calls are replaced by OperatorIntent.
 */

export const FF = {
  /** Gate legacy direct API calls via getTitanExecutionUrl (true = allow) */
  LEGACY_API: true,
} as const;

export type FeatureFlag = keyof typeof FF;
