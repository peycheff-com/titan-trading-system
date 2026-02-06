export declare const TITAN_STREAMS: readonly [{
    readonly name: "TITAN_CMD";
    readonly subjects: readonly ["titan.cmd.>"];
    readonly storage: "file";
    readonly retention: "workqueue";
    readonly max_age: number;
    readonly duplicate_window: number;
}, {
    readonly name: "TITAN_EVT";
    readonly subjects: readonly ["titan.evt.>"];
    readonly storage: "file";
    readonly retention: "limits";
    readonly max_age: number;
    readonly max_bytes: number;
}, {
    readonly name: "TITAN_DATA";
    readonly subjects: readonly ["titan.data.>"];
    readonly storage: "memory";
    readonly retention: "limits";
    readonly max_age: number;
}, {
    readonly name: "TITAN_SIGNAL";
    readonly subjects: readonly ["titan.signal.>"];
    readonly storage: "file";
    readonly retention: "limits";
    readonly max_age: number;
    readonly max_bytes: number;
}, {
    readonly name: "TITAN_DLQ";
    readonly subjects: readonly ["titan.dlq.>"];
    readonly storage: "file";
    readonly retention: "limits";
    readonly max_age: number;
    readonly max_bytes: number;
}];
//# sourceMappingURL=titan_streams.d.ts.map