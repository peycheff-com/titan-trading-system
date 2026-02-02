import { z } from 'zod';

export const DoraIncidentClassification = z.enum([
  'MAJOR', // Minimal impact, no data loss
  'SIGNIFICANT', // Severe impact, potential data loss, regulatory reporting mandatory
]);

export const DoraIncidentStatus = z.enum(['DETECTED', 'INVESTIGATING', 'MITIGATED', 'RESOLVED']);

export const DoraIncidentSchema = z.object({
  incidentId: z.string().uuid(),
  title: z.string().min(5).max(100),
  description: z.string().min(10),
  detectionTime: z.string().datetime(),
  classification: DoraIncidentClassification,
  status: DoraIncidentStatus,
  affectedServices: z.array(z.string()),
  rootCause: z.string().optional(),
  remediationSteps: z.array(z.string()).optional(),
  estimatedLossCents: z.number().int().optional(), // Financial impact in cents
  isReportable: z.boolean().default(false), // Whether this meets Article 19 definition
});

export type DoraIncident = z.infer<typeof DoraIncidentSchema>;
