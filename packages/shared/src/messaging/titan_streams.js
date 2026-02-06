export const TITAN_STREAMS = [
    {
        name: 'TITAN_CMD',
        subjects: ['titan.cmd.>'],
        storage: 'file',
        retention: 'workqueue',
        max_age: 7 * 24 * 60 * 60 * 1000 * 1000 * 1000, // 7 Days
        duplicate_window: 60 * 1000 * 1000 * 1000, // 1 min
    },
    {
        name: 'TITAN_EVT',
        subjects: ['titan.evt.>'],
        storage: 'file',
        retention: 'limits',
        max_age: 30 * 24 * 60 * 60 * 1000 * 1000 * 1000, // 30 Days
        max_bytes: 10 * 1024 * 1024 * 1024, // 10 GB
    },
    {
        name: 'TITAN_DATA',
        subjects: ['titan.data.>'],
        storage: 'memory',
        retention: 'limits',
        max_age: 15 * 60 * 1000 * 1000 * 1000, // 15 Min
    },
    {
        name: 'TITAN_SIGNAL',
        subjects: ['titan.signal.>'],
        storage: 'file',
        retention: 'limits',
        max_age: 24 * 60 * 60 * 1000 * 1000 * 1000, // 1 Day
        max_bytes: 5 * 1024 * 1024 * 1024, // 5 GB
    },
    {
        name: 'TITAN_DLQ',
        subjects: ['titan.dlq.>'],
        storage: 'file',
        retention: 'limits',
        max_age: 30 * 24 * 60 * 60 * 1000 * 1000 * 1000, // 30 Days
        max_bytes: 1 * 1024 * 1024 * 1024, // 1 GB
    },
];
//# sourceMappingURL=titan_streams.js.map