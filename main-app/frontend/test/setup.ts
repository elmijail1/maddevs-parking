import "@testing-library/jest-dom/vitest";
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

export class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  disconnected = false;

  constructor(private callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this);
  }

  observe() {}

  disconnect() {
    this.disconnected = true;
  }

  static scrollToEnd() {
    const live = FakeIntersectionObserver.instances.filter((observer) => !observer.disconnected);
    act(() => {
      for (const observer of live) {
        observer.callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          observer as unknown as IntersectionObserver,
        );
      }
    });
  }
}

beforeEach(() => {
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

afterEach(() => {
  cleanup();
});
