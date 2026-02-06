import { z } from 'zod';
export declare const EvidencePackManifestSchemaV1: z.ZodObject<{
    v: z.ZodLiteral<1>;
    id: z.ZodString;
    ts: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    time_window: z.ZodObject<{
        start: z.ZodString;
        end: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        end: string;
        start: string;
    }, {
        end: string;
        start: string;
    }>;
    contents: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        hash: z.ZodString;
        size_bytes: z.ZodNumber;
        type: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: string;
        path: string;
        hash: string;
        size_bytes: number;
    }, {
        type: string;
        path: string;
        hash: string;
        size_bytes: number;
    }>, "many">;
    meta: z.ZodObject<{
        created_by: z.ZodString;
        total_size_bytes: z.ZodNumber;
        checksum: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        checksum: string;
        created_by: string;
        total_size_bytes: number;
    }, {
        checksum: string;
        created_by: string;
        total_size_bytes: number;
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    ts: string;
    description: string;
    v: 1;
    meta: {
        checksum: string;
        created_by: string;
        total_size_bytes: number;
    };
    title: string;
    time_window: {
        end: string;
        start: string;
    };
    contents: {
        type: string;
        path: string;
        hash: string;
        size_bytes: number;
    }[];
}, {
    id: string;
    ts: string;
    description: string;
    v: 1;
    meta: {
        checksum: string;
        created_by: string;
        total_size_bytes: number;
    };
    title: string;
    time_window: {
        end: string;
        start: string;
    };
    contents: {
        type: string;
        path: string;
        hash: string;
        size_bytes: number;
    }[];
}>;
export type EvidencePackManifestV1 = z.infer<typeof EvidencePackManifestSchemaV1>;
//# sourceMappingURL=evidence-pack.d.ts.map