/** Fired when the ERPNext session is no longer valid (axios interceptor). */
const listeners = new Set<() => void>();

export function subscribeSessionInvalid(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitSessionInvalid() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}
