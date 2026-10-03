/* Web Audio: a small sound-effect palette and a quiet biome ambience loop (data in data/sounds.js).
   Everything is optional: failures never affect gameplay, and nothing plays while sound is off.
   - one AudioContext, created on the first user gesture (browsers keep it locked until then)
   - one ambience handle at a time, so loops can never stack; hiding the tab or pausing suspends it. */
import {AMBIENCE, SFX, VOLUMES} from '../data/sounds.js';

const FADE = 0.8; // seconds to fade ambience in and out

/** @param {{contextFactory?: () => AudioContext}} [options] a factory so tests can supply a fake context */
export function createAudio({contextFactory = () => new (window.AudioContext || window.webkitAudioContext)()} = {}) {
  let context = null;
  let master = null;
  let enabled = false; // all audio on/off
  let volume = VOLUMES.medium;
  let ambienceOn = true; // ambience on/off, separate from effects
  let region = null; // region id the ambience should follow
  let held = false; // paused game or hidden tab
  let active = null; // {region, gain, sources[]}: the one ambience loop

  const ensure = () => {
    if (!context) {
      context = contextFactory();
      master = context.createGain();
      master.gain.value = volume;
      master.connect(context.destination);
    }
    return context;
  };
  const guard = fn => {
    try {
      return fn();
    } catch {
      return undefined; /* audio is optional */
    }
  };
  const wantAmbience = () => enabled && ambienceOn && !held && region !== null && !!AMBIENCE[region];

  function stopAmbience() {
    if (!active) return;
    const {gain, sources} = active;
    active = null;
    guard(() => {
      const now = context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + FADE);
      for (const s of sources) s.stop(now + FADE + 0.05);
    });
  }

  function startAmbience() {
    if (!context || !wantAmbience() || active?.region === region) return;
    stopAmbience();
    guard(() => {
      const profile = AMBIENCE[region];
      const now = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + FADE);
      gain.connect(master);
      const sources = [];
      for (const f of profile.drone) {
        const osc = context.createOscillator();
        const g = context.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        g.gain.value = 0.012;
        osc.connect(g).connect(gain);
        osc.start();
        sources.push(osc);
      }
      // Wind/water: a looped noise buffer through a band-pass filter, swelling slowly.
      const length = context.sampleRate * 2;
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      let seed = 1;
      for (let i = 0; i < length; i++) data[i] = (((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1) * 0.5;
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = profile.noise.f;
      filter.Q.value = profile.noise.q;
      const level = context.createGain();
      level.gain.value = profile.noise.g * 0.6;
      const lfo = context.createOscillator();
      const depth = context.createGain();
      lfo.frequency.value = profile.swell;
      depth.gain.value = profile.noise.g * 0.4;
      lfo.connect(depth).connect(level.gain);
      noise.connect(filter).connect(level).connect(gain);
      noise.start();
      lfo.start();
      sources.push(noise, lfo);
      active = {region, gain, sources};
    });
  }

  /** Applies the wanted state: starts, switches or stops the ambience, and suspends the context when nothing should play. */
  function sync() {
    guard(() => {
      if (!context) return;
      if (!enabled || held) {
        stopAmbience();
        if (context.state === 'running') context.suspend(); // nothing should play: let the device sleep
        return;
      }
      if (context.state === 'suspended') context.resume();
      if (wantAmbience()) startAmbience();
      else stopAmbience();
    });
  }

  return {
    get enabled() {
      return enabled;
    },
    /** Called from user gestures: creates the context (browsers require a gesture) and resumes it after interruptions. */
    unlock() {
      if (!enabled) return;
      guard(() => {
        ensure();
        sync();
      });
    },
    set(value) {
      enabled = !!value;
      if (enabled) guard(() => (context ? sync() : undefined));
      else sync();
    },
    toggle() {
      this.set(!enabled);
      return enabled;
    },
    setVolume(name) {
      volume = VOLUMES[name] ?? volume;
      if (master) guard(() => (master.gain.value = volume));
    },
    setAmbienceEnabled(value) {
      ambienceOn = !!value;
      sync();
    },
    /** The region whose ambience should play (null for none). */
    setRegion(id) {
      region = id ?? null;
      sync();
    },
    /** True while the game is paused or the tab is hidden: ambience stops and the context sleeps. */
    hold(value) {
      held = !!value;
      sync();
    },
    play(name) {
      if (!enabled || held || !SFX[name]) return;
      guard(() => {
        ensure();
        if (context.state === 'suspended') context.resume();
        const start = context.currentTime;
        for (const n of SFX[name]) {
          const osc = context.createOscillator();
          const gain = context.createGain();
          const at = start + (n.t ?? 0);
          osc.type = n.type ?? 'triangle';
          osc.frequency.setValueAtTime(n.f, at);
          if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, at + n.d);
          gain.gain.setValueAtTime(n.g ?? 0.05, at);
          gain.gain.exponentialRampToValueAtTime(0.001, at + n.d);
          osc.connect(gain).connect(master);
          osc.start(at);
          osc.stop(at + n.d + 0.02);
        }
      });
    },
  };
}
