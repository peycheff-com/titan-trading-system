import { TITAN_SUBJECTS } from './titan_subjects.js';

export const TITAN_STREAMS = [
  {
    name: 'TITAN_CMD',
    subjects: [TITAN_SUBJECTS.CMD.ALL],
    storage: 'file' as const,
    retention: 'workqueue' as const,
    max_age: 7 * 24 * 60 * 60 * 1000 * 1000 * 1000, // 7 Days
    duplicate_window: 60 * 1000 * 1000 * 1000, // 1 min
  },
  {
    name: 'TITAN_EVT',
    subjects: [TITAN_SUBJECTS.EVT.ALL],
    storage: 'file' as const,
    retention: 'limits' as const,
    max_age: 30 * 24 * 60 * 60 * 1000 * 1000 * 1000, // 30 Days
    max_bytes: 10 * 1024 * 1024 * 1024, // 10 GB
  },
  {
    name: 'TITAN_DATA',
    subjects: [TITAN_SUBJECTS.DATA.ALL],
    storage: 'memory' as const,
    retention: 'limits' as const,
    max_age: 15 * 60 * 1000 * 1000 * 1000, // 15 Min
  },
  {
    name: 'TITAN_SIGNAL',
    subjects: [TITAN_SUBJECTS.SIGNAL.ALL],
    storage: 'file' as const,
    retention: 'limits' as const,
    max_age: 24 * 60 * 60 * 1000 * 1000 * 1000, // 1 Day
    max_bytes: 5 * 1024 * 1024 * 1024, // 5 GB
  },
  {
    name: 'TITAN_DLQ',
    subjects: [TITAN_SUBJECTS.DLQ.ALL],
    storage: 'file' as const,
    retention: 'limits' as const,
    max_age: 30 * 24 * 60 * 60 * 1000 * 1000 * 1000, // 30 Days
    max_bytes: 1 * 1024 * 1024 * 1024, // 1 GB
  },
] as const;
