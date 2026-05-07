import test from 'node:test';
import assert from 'node:assert/strict';

import { AudioController } from '../src/audio/AudioController.js';
import {
  SNAIL_MUSIC_AVAILABLE_NOTES,
  SNAIL_MUSIC_DEFAULT_NOTE_DURATION,
  SNAIL_MUSIC_NOTE_TO_FREQ,
  createSnailMusicSongEvents,
  encodeSnailMusicWav,
  generateSnailMusicSequence,
  getSnailMusicAmplitudeAt,
  listSnailMusicSongs,
  renderSnailMusicEvents,
  renderSnailMusicSamples
} from '../src/audio/SnailMusic.js';
import type { SnailMusicNote } from '../src/audio/SnailMusic.js';

class FakeAudioParam {
  declare events: any[];
  declare value: number;

  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }

  setValueAtTime(value, time) {
    this.value = value;
    this.events.push({ type: 'set', value, time });
  }

  linearRampToValueAtTime(value, time) {
    this.value = value;
    this.events.push({ type: 'linearRamp', value, time });
  }
}

class FakeGainNode {
  declare connections: any[];
  declare disconnected: boolean;
  declare gain: FakeAudioParam;

  constructor() {
    this.gain = new FakeAudioParam();
    this.connections = [];
    this.disconnected = false;
  }

  connect(target) {
    this.connections.push(target);
  }

  disconnect() {
    this.disconnected = true;
  }
}

class FakeOscillatorNode {
  declare connections: any[];
  declare disconnected: boolean;
  declare frequency: FakeAudioParam;
  declare onended: any;
  declare startTime: number | null;
  declare stopTime: number | null;
  declare type: string;

  constructor() {
    this.type = 'sine';
    this.frequency = new FakeAudioParam();
    this.connections = [];
    this.disconnected = false;
    this.startTime = null;
    this.stopTime = null;
    this.onended = null;
  }

  connect(target) {
    this.connections.push(target);
  }

  start(time) {
    this.startTime = time;
  }

  stop(time) {
    this.stopTime = time;
  }

  disconnect() {
    this.disconnected = true;
  }
}

class FakeDynamicsCompressorNode {
  declare attack: FakeAudioParam;
  declare connections: any[];
  declare knee: FakeAudioParam;
  declare ratio: FakeAudioParam;
  declare release: FakeAudioParam;
  declare threshold: FakeAudioParam;

  constructor() {
    this.threshold = new FakeAudioParam();
    this.knee = new FakeAudioParam();
    this.ratio = new FakeAudioParam();
    this.attack = new FakeAudioParam();
    this.release = new FakeAudioParam();
    this.connections = [];
  }

  connect(target) {
    this.connections.push(target);
  }
}

class FakeAudioContext {
  declare compressors: FakeDynamicsCompressorNode[];
  declare currentTime: number;
  declare destination: any;
  declare gainNodes: FakeGainNode[];
  declare oscillators: FakeOscillatorNode[];
  declare resumeCount: number;
  declare state: string;

  constructor() {
    this.currentTime = 10;
    this.destination = { kind: 'destination' };
    this.gainNodes = [];
    this.oscillators = [];
    this.compressors = [];
    this.resumeCount = 0;
    this.state = 'running';
  }

  createGain() {
    const gain = new FakeGainNode();
    this.gainNodes.push(gain);
    return gain;
  }

  createOscillator() {
    const oscillator = new FakeOscillatorNode();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createDynamicsCompressor() {
    const compressor = new FakeDynamicsCompressorNode();
    this.compressors.push(compressor);
    return compressor;
  }

  resume() {
    this.resumeCount += 1;
    this.state = 'running';
    return Promise.resolve();
  }
}

function withSilencedMusicLogs(callback) {
  const originalLog = console.log;
  console.log = () => {};
  try {
    return callback();
  } finally {
    console.log = originalLog;
  }
}

function withRandomSequence(values, callback) {
  const originalRandom = Math.random;
  let index = 0;
  Math.random = () => {
    const value = values[index] ?? 0.37;
    index += 1;
    return value;
  };

  try {
    return callback();
  } finally {
    Math.random = originalRandom;
  }
}

function createController() {
  let context: FakeAudioContext | null = null;
  class TestAudioContext extends FakeAudioContext {
    constructor() {
      super();
      context = this;
    }
  }

  const previousWindow = (globalThis as any).window;
  (globalThis as any).window = {
    AudioContext: TestAudioContext,
    webkitAudioContext: TestAudioContext
  };

  try {
    const controller = withSilencedMusicLogs(() => new AudioController());
    return { controller, context: context as FakeAudioContext };
  } finally {
    (globalThis as any).window = previousWindow;
  }
}

function assertValidSequence(sequence, expectedLength = null) {
  if (expectedLength !== null) {
    assert.equal(sequence.length, expectedLength);
  }

  assert(sequence.length >= 4);
  assert(sequence.length <= 16);
  const noteNames = SNAIL_MUSIC_AVAILABLE_NOTES;
  const notes = new Set(noteNames);
  for (let index = 0; index < sequence.length; index += 1) {
    const entry = sequence[index];
    assert(notes.has(entry.note), `${entry.note} should be a known note`);
    assert(Number.isFinite(SNAIL_MUSIC_NOTE_TO_FREQ[entry.note]));
    assert([SNAIL_MUSIC_DEFAULT_NOTE_DURATION, SNAIL_MUSIC_DEFAULT_NOTE_DURATION * 0.5].includes(entry.duration));

    if (index > 0) {
      const previousIndex = noteNames.indexOf(sequence[index - 1].note);
      const currentIndex = noteNames.indexOf(entry.note);
      const rawDistance = Math.abs(currentIndex - previousIndex);
      const wrappedDistance = Math.min(rawDistance, noteNames.length - rawDistance);
      assert(wrappedDistance <= 3, `${sequence[index - 1].note} -> ${entry.note} jumps too far`);
    }
  }
}

test('music generator creates valid small chromatic snail loops', () => {
  const sequence = withRandomSequence([
    0.05, 0.25,
    0.30, 0.75,
    0.80, 0.10,
    0.55, 0.90,
    0.12, 0.49,
    0.63, 0.51,
    0.94, 0.01,
    0.22, 0.86,
    0.42, 0.40,
    0.70, 0.60,
    0.15, 0.20,
    0.88, 0.99
  ], () => generateSnailMusicSequence({ length: 12 }));

  assertValidSequence(sequence, 12);
});

test('music generator default length stays in the intended four-to-eight note range', () => {
  const shortest = withRandomSequence([0], () => generateSnailMusicSequence());
  const longest = withRandomSequence([0.999], () => generateSnailMusicSequence());

  assertValidSequence(shortest, 4);
  assertValidSequence(longest, 8);
});

test('music rendering creates browser-safe samples and wav bytes from a sequence', () => {
  const sequence: SnailMusicNote[] = [
    { note: 'C3', duration: 0.5 },
    { note: 'D#3', duration: 0.25 }
  ];

  const samples = renderSnailMusicSamples({ sequence, sampleRate: 1000, volume: 0.5 });
  assert.equal(samples.length, 750);
  assert(samples.some((sample) => sample !== 0));
  assert(Math.max(...samples) <= 0.5);
  assert(Math.min(...samples) >= -0.5);

  const wav = encodeSnailMusicWav(samples, 1000);
  assert(wav instanceof Uint8Array);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...wav.slice(8, 12)), 'WAVE');
  assert.equal(String.fromCharCode(...wav.slice(36, 40)), 'data');
  assert.equal(wav.length, 44 + samples.length * 2);
});

test('snail phenomenology song presets are named and render audible snippets', () => {
  const songs = listSnailMusicSongs();
  const expectedIds = [
    'moisture_liturgical',
    'body_against_surface',
    'chemotaxis_folk',
    'stalk_counterpoint',
    'salt_horror',
    'wet_trail_minimalism',
    'micro_cathedral',
    'homeostatic_groove',
    'comical_noble_slime',
    'nocturnal_garden_electronics'
  ];

  assert.deepEqual(songs.map((song) => song.id), expectedIds);
  for (const song of songs) {
    const events = createSnailMusicSongEvents({ song: song.id, seconds: 2, random: () => 0.42 });
    const samples = renderSnailMusicEvents({ events, seconds: 2, sampleRate: 2000, volume: 0.2 });
    const peak = samples.reduce((maximum, sample) => Math.max(maximum, Math.abs(sample)), 0);

    assert(events.length > 0, `${song.id} should create note events`);
    assert.equal(samples.length, 4000);
    assert(peak > 0.001, `${song.id} should render non-silent audio`);
    assert(peak <= 1, `${song.id} should not clip`);
  }
});

test('music envelope is zero at edges and full after attack', () => {
  assert.equal(getSnailMusicAmplitudeAt(0, 0.5), 0);
  assert.equal(getSnailMusicAmplitudeAt(0.05, 0.5), 1);
  assert.equal(getSnailMusicAmplitudeAt(0.25, 0.5), 1);
  assert.equal(getSnailMusicAmplitudeAt(0.5, 0.5), 0);
});

test('music tone playback schedules a sine note through the compressor envelope', () => {
  const { controller, context } = createController();

  controller.playTone(220, 0.5);

  const oscillator = context.oscillators.at(-1);
  const noteGain = context.gainNodes.at(-1);

  assert.equal(oscillator.type, 'sine');
  assert.equal(oscillator.frequency.value, 220);
  assert.equal(oscillator.connections[0], noteGain);
  assert.equal(noteGain.connections[0], controller.compressor);
  assert.equal(oscillator.startTime, 10);
  assert.equal(oscillator.stopTime, 10.5);
  assert.deepEqual(noteGain.gain.events, [
    { type: 'set', value: 0, time: 10 },
    { type: 'linearRamp', value: 1, time: 10.05 },
    { type: 'set', value: 1, time: 10.45 },
    { type: 'linearRamp', value: 0, time: 10.5 }
  ]);

  oscillator.onended();
  assert.equal(oscillator.disconnected, true);
  assert.equal(noteGain.disconnected, true);
});

test('music volume clamps to the main gain range', () => {
  const { controller } = createController();

  controller.setVolume(-0.5);
  assert.equal(controller.mainGainNode.gain.value, 0);

  controller.setVolume(1.5);
  assert.equal(controller.mainGainNode.gain.value, 1);
});
