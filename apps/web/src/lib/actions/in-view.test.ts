import { afterEach, describe, expect, test } from "bun:test";

import { inView } from "./in-view";

// bun test has no DOM: stub just enough IntersectionObserver to capture the
// callback and drive it with fake entries.
type IoCallback = (entries: { isIntersecting: boolean }[]) => void;
const created: {
  callback: IoCallback;
  options?: IntersectionObserverInit;
  disconnected: boolean;
  observed: unknown[];
}[] = [];

class FakeIntersectionObserver {
  callback: IoCallback;
  options?: IntersectionObserverInit;
  disconnected = false;
  observed: unknown[] = [];
  constructor(callback: IoCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    created.push(this);
  }
  observe(node: unknown) {
    this.observed.push(node);
  }
  disconnect() {
    this.disconnected = true;
  }
}

const realIo = globalThis.IntersectionObserver;
globalThis.IntersectionObserver =
  FakeIntersectionObserver as unknown as typeof IntersectionObserver;
afterEach(() => {
  created.length = 0;
});
// Restore after the file's tests so other suites see the real global (if any).
process.on("beforeExit", () => {
  globalThis.IntersectionObserver = realIo;
});

const node = {} as HTMLElement;

describe("inView action", () => {
  test("observes the node and fires onEnter/onLeave per entry", () => {
    let enters = 0;
    let leaves = 0;
    inView(node, { onEnter: () => enters++, onLeave: () => leaves++ });

    const io = created[0]!;
    expect(io.observed).toEqual([node]);
    io.callback([{ isIntersecting: true }, { isIntersecting: false }]);
    expect(enters).toBe(1);
    expect(leaves).toBe(1);
  });

  test("defaults rootMargin to 200px and honors an override", () => {
    inView(node, undefined);
    inView(node, { rootMargin: "50px" });
    expect(created[0]!.options?.rootMargin).toBe("200px");
    expect(created[1]!.options?.rootMargin).toBe("50px");
  });

  test("update() swaps handlers; destroy() disconnects", () => {
    let first = 0;
    let second = 0;
    const handle = inView(node, { onEnter: () => first++ });
    const io = created[0]!;

    handle?.update?.({ onEnter: () => second++ });
    io.callback([{ isIntersecting: true }]);
    expect(first).toBe(0);
    expect(second).toBe(1);

    // undefined params (and missing handlers) must not throw.
    handle?.update?.(undefined);
    io.callback([{ isIntersecting: true }, { isIntersecting: false }]);

    handle?.destroy?.();
    expect(io.disconnected).toBe(true);
  });
});
