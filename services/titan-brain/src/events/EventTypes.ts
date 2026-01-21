import { z } from 'zod';

export const EventType = {
  INTENT_CREATED: 'INTENT_CREATED',
  INTENT_VALIDATED: 'INTENT_VALIDATED',
  INTENT_REJECTED: 'INTENT_REJECTED',
  ORDER_SENT: 'ORDER_SENT',
  ORDER_FILLED: 'ORDER_FILLED',
  RECONCILIATION_COMPLETED: 'RECONCILIATION_COMPLETED',
  RECONCILIATION_DRIFT_DETECTED: 'RECONCILIATION_DRIFT_DETECTED',
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

export const TitanEventMetadataSchema = z.object({
  traceId: z.string().uuid(),
  actor: z.string().optional(),
  version: z.number().int().default(1),
  timestamp: z.date().default(() => new Date()),
});

export const TitanEventSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(EventType),
  aggregateId: z.string(),
  payload: z.record(z.any()),
  metadata: TitanEventMetadataSchema,
});

export type TitanEvent<T = any> = {
  id: string;
  type: EventType;
  aggregateId: string;
  payload: T;
  metadata: z.infer<typeof TitanEventMetadataSchema>;
};
