import { EventEmitter } from 'events';

type SessionType = 'ASIAN' | 'LONDON' | 'NY' | 'DEAD_ZONE';

interface SessionState {
  type: SessionType;
  startTime: number;
  endTime: number;
  timeRemaining: number;
}

export class SessionProfiler extends EventEmitter {
  constructor() {
    super();
  }

  getSessionState(): SessionState {
    return {
      type: 'ASIAN',
      startTime: 0,
      endTime: 6,
      timeRemaining: 3
    };
  }
}