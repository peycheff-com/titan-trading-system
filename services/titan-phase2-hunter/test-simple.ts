import { EventEmitter } from 'events';

export class TestSessionProfiler extends EventEmitter {
  constructor() {
    super();
  }

  test(): string {
    return 'working';
  }
}