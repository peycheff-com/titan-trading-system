"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestSessionProfiler = void 0;
const events_1 = require("events");
class TestSessionProfiler extends events_1.EventEmitter {
    constructor() {
        super();
    }
    test() {
        return 'working';
    }
}
exports.TestSessionProfiler = TestSessionProfiler;
