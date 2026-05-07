export type SnailMusicNoteName =
  | 'C3'
  | 'C#3'
  | 'D3'
  | 'D#3'
  | 'E3'
  | 'F3'
  | 'F#3'
  | 'G3'
  | 'G#3'
  | 'A3'
  | 'A#3'
  | 'B3'
  | 'C4';

export interface SnailMusicNote {
  note: SnailMusicNoteName;
  duration: number;
}

export interface SnailMusicEnvelope {
  attackTime: number;
  releaseTime: number;
}

export interface SnailMusicTonePlan extends SnailMusicEnvelope {
  duration: number;
  frequency: number;
  oscillatorType: OscillatorType;
}

export interface SnailMusicRenderOptions {
  sequence: SnailMusicNote[];
  sampleRate?: number;
  volume?: number;
  envelope?: Partial<SnailMusicEnvelope>;
}

export interface SnailMusicEvent {
  start: number;
  duration: number;
  note?: SnailMusicNoteName;
  frequency?: number;
  volume?: number;
  waveform?: OscillatorType;
  detuneCents?: number;
}

export interface SnailMusicEventRenderOptions {
  events: SnailMusicEvent[];
  seconds?: number | null;
  sampleRate?: number;
  volume?: number;
  envelope?: Partial<SnailMusicEnvelope>;
}

export interface SnailMusicSongRenderOptions {
  song?: string | null;
  seconds?: number;
  random?: () => number;
}

export interface SnailMusicSongDefinition {
  id: string;
  label: string;
  description: string;
  createEvents: (options?: SnailMusicSongRenderOptions) => SnailMusicEvent[];
}

export const SNAIL_MUSIC_NOTE_TO_FREQ: Readonly<Record<SnailMusicNoteName, number>> = Object.freeze({
  C3: 130.81,
  'C#3': 138.59,
  D3: 146.83,
  'D#3': 155.56,
  E3: 164.81,
  F3: 174.61,
  'F#3': 185.00,
  G3: 196.00,
  'G#3': 207.65,
  A3: 220.00,
  'A#3': 233.08,
  B3: 246.94,
  C4: 261.63
});

export const SNAIL_MUSIC_AVAILABLE_NOTES = Object.freeze(Object.keys(SNAIL_MUSIC_NOTE_TO_FREQ) as SnailMusicNoteName[]);
export const SNAIL_MUSIC_DEFAULT_NOTE_DURATION = 0.5;
export const SNAIL_MUSIC_DEFAULT_ATTACK_TIME = 0.05;
export const SNAIL_MUSIC_DEFAULT_RELEASE_TIME = 0.05;
export const SNAIL_MUSIC_DEFAULT_VOLUME = 0.18;
export const SNAIL_MUSIC_DEFAULT_SAMPLE_RATE = 44100;
export const SNAIL_MUSIC_OSCILLATOR_TYPE: OscillatorType = 'sine';
export const DEFAULT_SNAIL_MUSIC_SONG_ID = 'wet_trail_minimalism';

export function clampSnailMusicValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getSnailMusicEnvelope(envelope: Partial<SnailMusicEnvelope> = {}): SnailMusicEnvelope {
  return {
    attackTime: Math.max(0, Number.isFinite(envelope.attackTime) ? Number(envelope.attackTime) : SNAIL_MUSIC_DEFAULT_ATTACK_TIME),
    releaseTime: Math.max(0, Number.isFinite(envelope.releaseTime) ? Number(envelope.releaseTime) : SNAIL_MUSIC_DEFAULT_RELEASE_TIME)
  };
}

export function generateSnailMusicSequence({
  length = null,
  random = Math.random,
  availableNotes = SNAIL_MUSIC_AVAILABLE_NOTES,
  noteDuration = SNAIL_MUSIC_DEFAULT_NOTE_DURATION,
  maxJump = 3
}: any = {}): SnailMusicNote[] {
  const notes = availableNotes.length > 0 ? availableNotes : SNAIL_MUSIC_AVAILABLE_NOTES;
  const resolvedLength = length === null || length === undefined
    ? Math.floor(random() * 5) + 4
    : Math.max(1, Math.floor(Number(length) || 1));
  const sequence: SnailMusicNote[] = [];

  for (let index = 0; index < resolvedLength; index += 1) {
    let noteIndex: number;
    if (index === 0) {
      noteIndex = Math.floor(random() * notes.length);
    } else {
      const previousNoteIndex = notes.indexOf(sequence[index - 1].note);
      const jump = Math.floor(random() * (maxJump * 2 + 1)) - maxJump;
      noteIndex = (previousNoteIndex + jump + notes.length) % notes.length;
    }

    sequence.push({
      note: notes[noteIndex],
      duration: random() < 0.5 ? noteDuration : noteDuration * 0.5
    });
  }

  return sequence;
}

export function createSnailMusicTonePlan(noteOrFrequency: SnailMusicNoteName | number, duration: number, envelope = getSnailMusicEnvelope()): SnailMusicTonePlan {
  const frequency = typeof noteOrFrequency === 'number'
    ? noteOrFrequency
    : SNAIL_MUSIC_NOTE_TO_FREQ[noteOrFrequency];
  return {
    frequency,
    duration,
    oscillatorType: SNAIL_MUSIC_OSCILLATOR_TYPE,
    ...getSnailMusicEnvelope(envelope)
  };
}

function noteFrequency(note: SnailMusicNoteName, detuneCents = 0) {
  return SNAIL_MUSIC_NOTE_TO_FREQ[note] * (2 ** (detuneCents / 1200));
}

function oscillatorSample(waveform: OscillatorType, phase: number) {
  const normalized = phase - Math.floor(phase);
  switch (waveform) {
    case 'square':
      return normalized < 0.5 ? 1 : -1;
    case 'sawtooth':
      return normalized * 2 - 1;
    case 'triangle':
      return 1 - 4 * Math.abs(normalized - 0.5);
    case 'sine':
    default:
      return Math.sin(phase * Math.PI * 2);
  }
}

export function getSnailMusicAmplitudeAt(noteTime: number, duration: number, envelope = getSnailMusicEnvelope()) {
  const resolved = getSnailMusicEnvelope(envelope);
  if (duration <= 0 || noteTime < 0 || noteTime > duration) {
    return 0;
  }

  const attack = resolved.attackTime > 0 ? noteTime / resolved.attackTime : 1;
  const release = resolved.releaseTime > 0 ? (duration - noteTime) / resolved.releaseTime : 1;
  return clampSnailMusicValue(Math.min(attack, release), 0, 1);
}

export function renderSnailMusicSamples({
  sequence,
  sampleRate = SNAIL_MUSIC_DEFAULT_SAMPLE_RATE,
  volume = SNAIL_MUSIC_DEFAULT_VOLUME,
  envelope = {}
}: SnailMusicRenderOptions): Float32Array {
  const resolvedEnvelope = getSnailMusicEnvelope(envelope);
  const safeSampleRate = Math.max(1, Math.floor(sampleRate));
  const safeVolume = clampSnailMusicValue(volume, 0, 1);
  const totalSeconds = sequence.reduce((sum, note) => sum + Math.max(0, note.duration), 0);
  const samples = new Float32Array(Math.max(0, Math.floor(totalSeconds * safeSampleRate)));
  let sampleOffset = 0;

  for (const entry of sequence) {
    const frequency = SNAIL_MUSIC_NOTE_TO_FREQ[entry.note];
    const noteSampleCount = Math.floor(Math.max(0, entry.duration) * safeSampleRate);
    for (let noteSampleIndex = 0; noteSampleIndex < noteSampleCount && sampleOffset < samples.length; noteSampleIndex += 1) {
      const noteTime = noteSampleIndex / safeSampleRate;
      const absoluteTime = sampleOffset / safeSampleRate;
      const envelopeAmount = getSnailMusicAmplitudeAt(noteTime, entry.duration, resolvedEnvelope);
      samples[sampleOffset] = Math.sin(2 * Math.PI * frequency * absoluteTime) * envelopeAmount * safeVolume;
      sampleOffset += 1;
    }
  }

  return samples;
}

export function renderSnailMusicEvents({
  events,
  seconds = null,
  sampleRate = SNAIL_MUSIC_DEFAULT_SAMPLE_RATE,
  volume = SNAIL_MUSIC_DEFAULT_VOLUME,
  envelope = {}
}: SnailMusicEventRenderOptions): Float32Array {
  const resolvedEnvelope = getSnailMusicEnvelope(envelope);
  const safeSampleRate = Math.max(1, Math.floor(sampleRate));
  const safeVolume = clampSnailMusicValue(volume, 0, 1);
  const totalSeconds = seconds ?? events.reduce((maximum, event) => (
    Math.max(maximum, event.start + Math.max(0, event.duration))
  ), 0);
  const samples = new Float32Array(Math.max(0, Math.floor(Math.max(0, totalSeconds) * safeSampleRate)));

  for (const event of events) {
    const start = Math.max(0, event.start);
    const duration = Math.max(0, event.duration);
    const frequency = Number.isFinite(event.frequency)
      ? Number(event.frequency)
      : event.note
        ? noteFrequency(event.note, event.detuneCents ?? 0)
        : 0;
    if (frequency <= 0 || duration <= 0) {
      continue;
    }

    const eventVolume = clampSnailMusicValue(event.volume ?? 1, 0, 2);
    const waveform = event.waveform ?? SNAIL_MUSIC_OSCILLATOR_TYPE;
    const startSample = Math.max(0, Math.floor(start * safeSampleRate));
    const endSample = Math.min(samples.length, Math.floor((start + duration) * safeSampleRate));
    for (let sampleIndex = startSample; sampleIndex < endSample; sampleIndex += 1) {
      const absoluteTime = sampleIndex / safeSampleRate;
      const noteTime = absoluteTime - start;
      const envelopeAmount = getSnailMusicAmplitudeAt(noteTime, duration, resolvedEnvelope);
      const sample = oscillatorSample(waveform, frequency * noteTime) * envelopeAmount * safeVolume * eventVolume;
      samples[sampleIndex] = clampSnailMusicValue(samples[sampleIndex] + sample, -1, 1);
    }
  }

  return samples;
}

export function encodeSnailMusicWav(samples: Float32Array, sampleRate = SNAIL_MUSIC_DEFAULT_SAMPLE_RATE) {
  const safeSampleRate = Math.max(1, Math.floor(sampleRate));
  const wav = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(wav.buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      wav[offset + index] = value.charCodeAt(index);
    }
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, safeSampleRate, true);
  view.setUint32(28, safeSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let index = 0; index < samples.length; index += 1) {
    const value = clampSnailMusicValue(samples[index], -1, 1);
    view.setInt16(44 + index * 2, Math.round(value * 32767), true);
  }

  return wav;
}

function event(start: number, note: SnailMusicNoteName, duration: number, volume = 1, waveform: OscillatorType = 'sine', detuneCents = 0): SnailMusicEvent {
  return { start, note, duration, volume, waveform, detuneCents };
}

function drone(note: SnailMusicNoteName, duration: number, volume = 0.45, detuneCents = 0): SnailMusicEvent {
  return event(0, note, duration, volume, 'sine', detuneCents);
}

function steppedMelody(notes: SnailMusicNoteName[], stepDuration: number, volume = 1, waveform: OscillatorType = 'sine', start = 0): SnailMusicEvent[] {
  return notes.map((note, index) => event(start + index * stepDuration, note, stepDuration, volume, waveform));
}

function repeatUntilSeconds(pattern: SnailMusicEvent[], seconds: number, period: number): SnailMusicEvent[] {
  const events: SnailMusicEvent[] = [];
  for (let offset = 0; offset < seconds; offset += period) {
    for (const source of pattern) {
      if (offset + source.start >= seconds) {
        continue;
      }
      events.push({ ...source, start: offset + source.start });
    }
  }
  return events;
}

function jitter(random: () => number, magnitude: number) {
  return (random() - 0.5) * magnitude * 2;
}

export const SNAIL_MUSIC_SONGS: readonly SnailMusicSongDefinition[] = Object.freeze([
  Object.freeze({
    id: 'moisture_liturgical',
    label: 'Moisture Liturgical',
    description: 'Soft wet drones with small dew-bell answers.',
    createEvents: ({ seconds = 6 } = {}) => [
      drone('C3', seconds, 0.32),
      drone('G3', seconds, 0.12, -5),
      ...steppedMelody(['E3', 'G3', 'C4', 'G3', 'F3', 'E3'], seconds / 6, 0.45, 'sine')
    ]
  }),
  Object.freeze({
    id: 'body_against_surface',
    label: 'Body Against Surface',
    description: 'Sticky drag, close semitone pressure, and slow surface pull.',
    createEvents: ({ seconds = 6 } = {}) => [
      drone('C#3', seconds, 0.24, -9),
      ...steppedMelody(['C#3', 'D3', 'C#3', 'D#3', 'D3', 'C3', 'C#3', 'D3'], seconds / 8, 0.62, 'triangle')
        .map((entry, index) => ({ ...entry, detuneCents: index % 2 === 0 ? -14 : 18 }))
    ]
  }),
  Object.freeze({
    id: 'chemotaxis_folk',
    label: 'Chemotaxis Folk',
    description: 'A small food-gradient tune that brightens as it finds the source.',
    createEvents: ({ seconds = 6 } = {}) => [
      drone('C3', seconds, 0.16),
      ...steppedMelody(['C3', 'E3', 'D3', 'F3', 'E3', 'G3', 'A3', 'C4'], seconds / 8, 0.7, 'sine')
    ]
  }),
  Object.freeze({
    id: 'stalk_counterpoint',
    label: 'Stalk Counterpoint',
    description: 'Two eye-stalk voices wander around a lagging body drone.',
    createEvents: ({ seconds = 6 } = {}) => [
      drone('D3', seconds, 0.16),
      ...steppedMelody(['A3', 'G3', 'A#3', 'A3', 'G#3', 'A3'], seconds / 6, 0.48, 'sine'),
      ...steppedMelody(['F3', 'G3', 'F#3', 'E3', 'F3', 'D#3'], seconds / 6, 0.38, 'triangle', seconds / 12)
    ]
  }),
  Object.freeze({
    id: 'salt_horror',
    label: 'Salt Horror',
    description: 'Dry panic: brittle high pulses against a sick low warning.',
    createEvents: ({ seconds = 6 } = {}) => [
      drone('C3', seconds, 0.25, -20),
      ...repeatUntilSeconds([
        event(0, 'C4', 0.08, 0.58, 'square', 9),
        event(0.14, 'B3', 0.07, 0.45, 'square', -11),
        event(0.29, 'C#3', 0.18, 0.5, 'sawtooth', 16)
      ], seconds, 0.48)
    ]
  }),
  Object.freeze({
    id: 'wet_trail_minimalism',
    label: 'Wet Trail Minimalism',
    description: 'Reich-ish trail memory: repeating damp motifs drift in phase.',
    createEvents: ({ seconds = 6 } = {}) => [
      ...repeatUntilSeconds(steppedMelody(['D3', 'F3', 'G3', 'F3'], 0.32, 0.5), seconds, 1.28),
      ...repeatUntilSeconds(steppedMelody(['A3', 'G3', 'F3', 'G3'], 0.31, 0.32, 'triangle'), seconds, 1.24)
    ]
  }),
  Object.freeze({
    id: 'micro_cathedral',
    label: 'Micro-Cathedral',
    description: 'Huge root spaces translated into low resonant intervals.',
    createEvents: ({ seconds = 6 } = {}) => [
      drone('C3', seconds, 0.34, -6),
      drone('G3', seconds, 0.18, 5),
      ...steppedMelody(['C4', 'B3', 'G3', 'E3'], seconds / 4, 0.32, 'sine')
    ]
  }),
  Object.freeze({
    id: 'homeostatic_groove',
    label: 'Homeostatic Groove',
    description: 'Hydration, hunger, danger, and health negotiate a lopsided loop.',
    createEvents: ({ seconds = 6 } = {}) => [
      ...repeatUntilSeconds([
        event(0, 'C3', 0.2, 0.6, 'triangle'),
        event(0.38, 'G3', 0.16, 0.34, 'sine'),
        event(0.74, 'D#3', 0.12, 0.38, 'square'),
        event(1.02, 'F3', 0.24, 0.42, 'sine')
      ], seconds, 1.35)
    ]
  }),
  Object.freeze({
    id: 'comical_noble_slime',
    label: 'Comical Noble Slime',
    description: 'Tiny heroic pageantry for slow absurd violence.',
    createEvents: ({ seconds = 6 } = {}) => [
      ...repeatUntilSeconds(steppedMelody(['C3', 'E3', 'G3', 'C4', 'G3', 'E3'], 0.25, 0.48, 'triangle'), seconds, 1.5),
      ...repeatUntilSeconds([
        event(0, 'C3', 0.08, 0.38, 'square'),
        event(0.5, 'G3', 0.08, 0.32, 'square'),
        event(1, 'C4', 0.08, 0.32, 'square')
      ], seconds, 1.5)
    ]
  }),
  Object.freeze({
    id: 'nocturnal_garden_electronics',
    label: 'Nocturnal Garden Electronics',
    description: 'Night ecology as damp filtered synth pulses and insect shimmer.',
    createEvents: ({ seconds = 6, random = Math.random } = {}) => [
      drone('F3', seconds, 0.2, -8),
      ...repeatUntilSeconds([
        event(0, 'F#3', 0.18, 0.38, 'sine', jitter(random, 9)),
        event(0.42, 'G#3', 0.12, 0.26, 'triangle', jitter(random, 14)),
        event(0.78, 'C4', 0.06, 0.18, 'square', jitter(random, 20))
      ], seconds, 1.05)
    ]
  })
]);

export function listSnailMusicSongs() {
  return SNAIL_MUSIC_SONGS.map((song) => ({
    id: song.id,
    label: song.label,
    description: song.description
  }));
}

export function getSnailMusicSong(songId: string | null | undefined) {
  return SNAIL_MUSIC_SONGS.find((song) => song.id === songId) ??
    SNAIL_MUSIC_SONGS.find((song) => song.id === DEFAULT_SNAIL_MUSIC_SONG_ID) ??
    SNAIL_MUSIC_SONGS[0];
}

export function createSnailMusicSongEvents(options: SnailMusicSongRenderOptions = {}) {
  const song = getSnailMusicSong(options.song);
  return song.createEvents(options);
}
