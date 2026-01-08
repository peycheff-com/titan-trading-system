"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionProfiler = void 0;
const events_1 = require("events");
class SessionProfiler extends events_1.EventEmitter {
    constructor() {
        super();
    }
    getSessionState() {
        return {
            type: 'ASIAN',
            startTime: 0,
            endTime: 6,
            timeRemaining: 3
        };
    }
}
exports.SessionProfiler = SessionProfiler;
