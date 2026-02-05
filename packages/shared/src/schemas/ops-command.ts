import { z } from 'zod';

export enum OpsCommandType {
  RESTART = 'restart',
  DEPLOY = 'deploy',
  CANCEL_ALL = 'cancel_all',
  SET_RISK = 'set_risk',
  HALT = 'halt',
  DISARM = 'disarm',
  ARM = 'arm',
  EXPORT_EVIDENCE = 'export_evidence',
}

export const OpsCommandSchemaV1 = z.object({
  v: z.literal(1),
  id: z.string().uuid(),
  ts: z.string().datetime(),
  type: z.nativeEnum(OpsCommandType),
  target: z.string(), // Service name or "all"
  params: z.record(z.string(), z.unknown()).optional(),
  meta: z.object({
    initiator_id: z.string(), // User ID
    reason: z.string(),
    signature: z.string(), // HMAC
  }),
});

export type OpsCommandV1 = z.infer<typeof OpsCommandSchemaV1>;
