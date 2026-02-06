import { z } from 'zod';
export declare const DoraIncidentClassification: z.ZodEnum<["MAJOR", "SIGNIFICANT"]>;
export declare const DoraIncidentStatus: z.ZodEnum<["DETECTED", "INVESTIGATING", "MITIGATED", "RESOLVED"]>;
export declare const DoraIncidentSchema: z.ZodObject<{
    incidentId: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    detectionTime: z.ZodString;
    classification: z.ZodEnum<["MAJOR", "SIGNIFICANT"]>;
    status: z.ZodEnum<["DETECTED", "INVESTIGATING", "MITIGATED", "RESOLVED"]>;
    affectedServices: z.ZodArray<z.ZodString, "many">;
    rootCause: z.ZodOptional<z.ZodString>;
    remediationSteps: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    estimatedLossCents: z.ZodOptional<z.ZodNumber>;
    isReportable: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    status: "DETECTED" | "INVESTIGATING" | "MITIGATED" | "RESOLVED";
    description: string;
    title: string;
    incidentId: string;
    detectionTime: string;
    classification: "MAJOR" | "SIGNIFICANT";
    affectedServices: string[];
    isReportable: boolean;
    rootCause?: string | undefined;
    remediationSteps?: string[] | undefined;
    estimatedLossCents?: number | undefined;
}, {
    status: "DETECTED" | "INVESTIGATING" | "MITIGATED" | "RESOLVED";
    description: string;
    title: string;
    incidentId: string;
    detectionTime: string;
    classification: "MAJOR" | "SIGNIFICANT";
    affectedServices: string[];
    rootCause?: string | undefined;
    remediationSteps?: string[] | undefined;
    estimatedLossCents?: number | undefined;
    isReportable?: boolean | undefined;
}>;
export type DoraIncident = z.infer<typeof DoraIncidentSchema>;
//# sourceMappingURL=DoraIncident.d.ts.map