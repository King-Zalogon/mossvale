// Sound palette and ambience (#38) against a fake Web Audio context: no leaked loops, mute/volume respected,
// suspend on hold, and every cue in the data is playable.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudio} from '../dist/src/services/audio.js';
import {AMBIENCE, SFX, VOLUMES} from '../dist/src/data/sounds.js';
import {regions} from '../dist/src/data/regions.js';
import {normalizeSettings, VOLUME_STEPS} from '../dist/src/services/settings.js';

function fakeContext() {
  const log = {nodes: [], created: 0, started: [], stopped: [], suspends: 0, resumes: 0, contexts: 0};
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
  });
  const node = (kind, extra = {}) => {
    const n = {
      kind,
      connect: to => to,
      gain: param(),
      frequency: param(),
      Q: param(),
      start() {
        log.started.push(n);
      },
      stop() {
        log.stopped.push(n);
      },
      ...extra,
    };
    log.created++;
    log.nodes.push(n);
    return n;
  };
  log.contexts++;
  const context = {
    state: 'running',
    currentTime: 0,
    sampleRate: 100,
    destination: {},
    createGain: () => node('gain'),
    createOscillator: () => node('osc'),
    createBiquadFilter: () => node('filter'),
    createBufferSource: () => node('noise'),
    createBuffer: (_c, length) => ({getChannelData: () => new Float32Array(length)}),
    suspend() {
      log.suspends++;
      context.state = 'suspended';
    },
    resume() {
      log.resumes++;
      context.state = 'running';
    },
  };
  return {context, log};
}
const make = () => {
  const fake = fakeContext();
  let factoryCalls = 0;
  const audio = createAudio({
    contextFactory: () => {
      factoryCalls++;
      return fake.context;
    },
  });
  return {audio, ...fake, calls: () => factoryCalls};
};
const live = log => log.started.filter(n => !log.stopped.includes(n));

test('every region has an ambience profile and every cue is well formed', () => {
  for (const r of regions) assert.ok(AMBIENCE[r.id], `ambience for ${r.id}`);
  for (const [name, notes] of Object.entries(SFX)) {
    assert.ok(notes.length > 0, name);
    for (const n of notes) assert.ok(n.f > 40 && n.f < 4000 && n.d > 0 && n.d < 1, `${name} note`);
  }
});

test('nothing is created or played while sound is off', () => {
  const {audio, log, calls} = make();
  audio.play('win');
  audio.setRegion('meadow');
  audio.unlock();
  assert.equal(calls(), 0, 'no audio context until sound is on and a gesture asks for it');
  assert.equal(log.created, 0);
});

test('effects play from the palette and unknown cues are ignored', () => {
  const {audio, log} = make();
  audio.set(true);
  audio.play('seal');
  assert.equal(log.started.filter(n => n.kind === 'osc').length, SFX.seal.length);
  const before = log.created;
  audio.play('no-such-cue');
  assert.equal(log.created, before);
});

test('volume steps scale the master gain, including one chosen before the context exists', () => {
  const {audio, log} = make();
  audio.setVolume('low'); // before any context exists
  audio.set(true);
  audio.unlock();
  const master = log.nodes.find(n => n.kind === 'gain');
  assert.equal(master.gain.value, VOLUMES.low);
  audio.setVolume('high');
  assert.equal(master.gain.value, VOLUMES.high);
  audio.setVolume('bogus');
  assert.equal(master.gain.value, VOLUMES.high, 'unknown steps are ignored');
  assert.deepEqual(VOLUME_STEPS, Object.keys(VOLUMES));
});

test('ambience: one loop at a time, switches with the region, stops with sound or the ambience setting', () => {
  const {audio, log} = make();
  audio.set(true);
  audio.setRegion('meadow');
  audio.unlock();
  const loops = () => live(log).filter(n => n.kind === 'noise').length;
  assert.equal(loops(), 1, 'one noise loop running');
  audio.setRegion('meadow');
  audio.unlock();
  assert.equal(loops(), 1, 'asking again does not stack a second loop');
  audio.setRegion('amber-ridge');
  assert.equal(loops(), 1, 'the old loop is told to stop when the region changes');
  assert.equal(log.started.filter(n => n.kind === 'noise').length, 2);
  audio.setAmbienceEnabled(false);
  assert.equal(loops(), 0, 'turning ambience off stops it but leaves effects');
  audio.play('tap');
  assert.ok(log.started.some(n => n.kind === 'osc'));
  audio.setAmbienceEnabled(true);
  assert.equal(loops(), 1);
  audio.set(false);
  assert.equal(loops(), 0, 'turning all sound off stops everything');
  assert.equal(log.suspends > 0, true, 'and lets the device sleep');
});

test('holding (paused game or hidden tab) silences and suspends; releasing resumes', () => {
  const {audio, log, context} = make();
  audio.set(true);
  audio.setRegion('frostveil-grove');
  audio.unlock();
  assert.equal(live(log).filter(n => n.kind === 'noise').length, 1);
  audio.hold(true);
  assert.equal(live(log).filter(n => n.kind === 'noise').length, 0);
  assert.equal(context.state, 'suspended');
  const before = log.created;
  audio.play('win');
  assert.equal(log.created, before, 'no effects while held');
  audio.hold(false);
  assert.equal(context.state, 'running');
  assert.equal(live(log).filter(n => n.kind === 'noise').length, 1, 'the ambience comes back once');
});

test('an interrupted context is resumed by the next gesture', () => {
  const {audio, context, log} = make();
  audio.set(true);
  audio.unlock();
  context.state = 'suspended'; // e.g. a phone call on iOS
  audio.unlock();
  assert.equal(context.state, 'running');
  assert.ok(log.resumes >= 1);
});

test('a browser without Web Audio never breaks play', () => {
  const audio = createAudio({
    contextFactory: () => {
      throw new Error('no audio');
    },
  });
  audio.set(true);
  assert.doesNotThrow(() => {
    audio.unlock();
    audio.play('win');
    audio.setRegion('meadow');
    audio.hold(true);
    audio.setVolume('low');
  });
});

test('audio preferences validate and default to a quiet start', () => {
  const s = normalizeSettings({});
  assert.equal(s.sound, false);
  assert.equal(s.volume, 'medium');
  assert.equal(s.ambience, true);
  assert.equal(normalizeSettings({volume: 'loud'}).volume, 'medium');
  assert.equal(normalizeSettings({ambience: false}).ambience, false);
  assert.equal(normalizeSettings({ambience: 'no'}).ambience, true);
});
