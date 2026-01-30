import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// Polyfill for ResizeObserver (Required by Radix UI)
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock;

// Polyfill for PointerEvent (Required by Radix UI)
if (!global.PointerEvent) {
  class PointerEventMock extends Event {
    pointerId = 0;
    width = 0;
    height = 0;
    pressure = 0;
    tangentialPressure = 0;
    tiltX = 0;
    tiltY = 0;
    twist = 0;
    pointerType = 'mouse';
    isPrimary = false;
  }
  global.PointerEvent = PointerEventMock as any;
}

// Polyfill for scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn();
