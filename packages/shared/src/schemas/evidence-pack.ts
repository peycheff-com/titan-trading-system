import { z } from 'zod';

export const EvidencePackManifestSchemaV1 = z.object({
  v: z.literal(1),
  id: z.string().uuid(),
  ts: z.string().datetime(),
  title: z.string(),
  description: z.string(),
  time_window: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  contents: z.array(
    z.object({
      path: z.string(),
      hash: z.string(), // SHA-256
      size_bytes: z.number(),
      type: z.string(), // "receipt", "log", "snapshot"
    }),
  ),
  meta: z.object({
    created_by: z.string(),
    total_size_bytes: z.number(),
    checksum: z.string(), // SHA-256 of the entire pack content
  }),
});

export type EvidencePackManifestV1 = z.infer<typeof EvidencePackManifestSchemaV1>;
