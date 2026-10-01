/* Cancellable playback of timed frames. Used only for presentation: game state is already final
   when playback starts, so cancelling or flushing never changes outcomes. Timers are injectable for tests. */
export function createTimeline({setTimer = setTimeout, clearTimer = clearTimeout} = {}) {
  let epoch = 0;
  let timer = null;
  let current = null;

  const stop = () => {
    epoch++;
    if (timer !== null) clearTimer(timer);
    timer = null;
    current = null;
  };

  return {
    get active() {
      return current !== null;
    },
    /** Shows each frame with `render`, waiting `frame.wait` ms before the next; calls `done` after the last. */
    play(frames, {render, done}) {
      stop();
      const mine = epoch;
      current = {frames, render, done};
      let i = 0;
      const step = () => {
        if (mine !== epoch) return;
        const frame = frames[i++];
        render(frame);
        if (i < frames.length) timer = setTimer(step, frame.wait ?? 0);
        else {
          current = null;
          timer = null;
          done();
        }
      };
      step();
    },
    /** Drops pending frames without rendering or completing them (stale callbacks become no-ops). */
    cancel: stop,
    /** Skips ahead: shows only the last frame and completes. Used when the tab is hidden or interrupted. */
    flush() {
      if (!current) return;
      const {frames, render, done} = current;
      stop();
      render(frames.at(-1));
      done();
    },
  };
}
