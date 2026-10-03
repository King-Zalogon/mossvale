/* Small manually advanced clock for deterministic action scripts. Runtime play still uses the browser clock. */
export function createTestClock(start = 0) {
  let tick = Number.isFinite(start) ? Math.max(0, start) : 0;
  return {
    now: () => tick,
    advance(milliseconds) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError('clock advance must be non-negative');
      tick += milliseconds;
      return tick;
    },
  };
}
