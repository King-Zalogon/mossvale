/* Web Audio beeps. Optional: failures never affect gameplay. */
export function createAudio() {
  let context = null;
  let enabled = false;
  return {
    get enabled() {
      return enabled;
    },
    set(value) {
      enabled = !!value;
    },
    toggle() {
      enabled = !enabled;
      return enabled;
    },
    tone(frequency = 440, duration = 0.2) {
      if (!enabled) return;
      try {
        context ||= new (window.AudioContext || window.webkitAudioContext)();
        if (context.state === 'suspended') context.resume();
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(frequency, context.currentTime);
        gain.gain.setValueAtTime(0.05, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
        osc.connect(gain).connect(context.destination);
        osc.start();
        osc.stop(context.currentTime + duration);
      } catch {
        /* audio is optional */
      }
    },
  };
}
