import { BacktestClock, SystemClock } from "../../../src/utils/time/Clock";

describe("Clock", () => {
  describe("SystemClock", () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it("returns current time/date", () => {
      const clock = new SystemClock();

      const t = clock.now();
      const d = clock.date();

      expect(typeof t).toBe("number");
      expect(Number.isFinite(t)).toBe(true);
      expect(d).toBeInstanceOf(Date);
    });

    it("supports setTimeout/clearTimeout", () => {
      jest.useFakeTimers();

      const clock = new SystemClock();

      const cb1 = jest.fn();
      const id1 = clock.setTimeout(cb1, 10);
      clock.clearTimeout(id1);

      jest.advanceTimersByTime(20);
      expect(cb1).not.toHaveBeenCalled();

      const cb2 = jest.fn();
      clock.setTimeout(cb2, 10);
      jest.advanceTimersByTime(10);
      expect(cb2).toHaveBeenCalledTimes(1);
    });

    it("supports setInterval/clearInterval", () => {
      jest.useFakeTimers();

      const clock = new SystemClock();
      const cb = jest.fn();

      const id = clock.setInterval(cb, 10);
      jest.advanceTimersByTime(35);
      expect(cb).toHaveBeenCalledTimes(3);

      clock.clearInterval(id);
      jest.advanceTimersByTime(100);
      expect(cb).toHaveBeenCalledTimes(3);
    });
  });

  describe("BacktestClock", () => {
    it("tracks time and date", () => {
      const clock = new BacktestClock(1_000);

      expect(clock.now()).toBe(1_000);
      expect(clock.date().getTime()).toBe(1_000);

      clock.advance(250);
      expect(clock.now()).toBe(1_250);
      expect(clock.date().getTime()).toBe(1_250);
    });

    it("rejects moving backwards", () => {
      const clock = new BacktestClock(1_000);
      expect(() => clock.setTime(999)).toThrow("Cannot move time backwards");
    });

    it("executes timeouts when due and removes them after firing", () => {
      const clock = new BacktestClock(0);
      const cb = jest.fn();

      clock.setTimeout(cb, 100);
      clock.advance(99);
      expect(cb).not.toHaveBeenCalled();

      clock.advance(1);
      expect(cb).toHaveBeenCalledTimes(1);

      // Advancing again should not re-fire (timeout is removed).
      clock.advance(1_000);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("executes multiple due timers in time order", () => {
      const clock = new BacktestClock(0);
      const fired: number[] = [];

      clock.setTimeout(() => fired.push(2), 100);
      clock.setTimeout(() => fired.push(1), 50);
      clock.advance(100);

      expect(fired).toEqual([1, 2]);
    });

    it("can clear a timeout before it executes", () => {
      const clock = new BacktestClock(0);
      const cb = jest.fn();

      const id = clock.setTimeout(cb, 100);
      clock.clearTimeout(id);
      clock.advance(1_000);

      expect(cb).not.toHaveBeenCalled();
    });

    it("executes intervals repeatedly and can clear them", () => {
      const clock = new BacktestClock(0);
      const cb = jest.fn();

      const id = clock.setInterval(cb, 100);
      clock.advance(100);
      expect(cb).toHaveBeenCalledTimes(1);

      clock.advance(100);
      expect(cb).toHaveBeenCalledTimes(2);

      clock.clearInterval(id);
      clock.advance(1_000);
      expect(cb).toHaveBeenCalledTimes(2);
    });
  });
});
