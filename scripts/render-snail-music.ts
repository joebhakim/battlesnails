import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  DEFAULT_SNAIL_MUSIC_SONG_ID,
  SNAIL_MUSIC_DEFAULT_SAMPLE_RATE,
  createSnailMusicSongEvents,
  encodeSnailMusicWav,
  getSnailMusicSong,
  listSnailMusicSongs,
  renderSnailMusicEvents
} from '../src/audio/SnailMusic.js';
import { SeededRandom } from '../src/sim/SeededRandom.js';

function readArg(name: string, fallback: string | null = null) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function playFile(path: string) {
  for (const command of ['pw-play', 'paplay', 'ffplay']) {
    const args = command === 'ffplay'
      ? ['-nodisp', '-autoexit', '-loglevel', 'error', path]
      : [path];
    const result = spawnSync(command, args, { stdio: 'inherit' });
    if (result.error && (result.error as any).code === 'ENOENT') {
      continue;
    }
    return result.status ?? 0;
  }

  console.error('No audio player found. Tried pw-play, paplay, ffplay.');
  return 1;
}

if (hasFlag('list')) {
  for (const song of listSnailMusicSongs()) {
    console.log(`${song.id}\t${song.label}\t${song.description}`);
  }
  process.exit(0);
}

const songId = readArg('song', DEFAULT_SNAIL_MUSIC_SONG_ID) ?? DEFAULT_SNAIL_MUSIC_SONG_ID;
const song = getSnailMusicSong(songId);
const outputPath = readArg('out', '/tmp/battlesnails_snail_music.wav') ?? '/tmp/battlesnails_snail_music.wav';
const seconds = Math.max(0.25, Number(readArg('seconds', '6')) || 6);
const seed = readArg('seed', 'snail-music') ?? 'snail-music';
const sampleRate = Math.max(8000, Math.floor(Number(readArg('sample-rate', `${SNAIL_MUSIC_DEFAULT_SAMPLE_RATE}`)) || SNAIL_MUSIC_DEFAULT_SAMPLE_RATE));
const rng = new SeededRandom(seed);
const events = createSnailMusicSongEvents({
  song: song.id,
  seconds,
  random: () => rng.next()
});

const rendered = renderSnailMusicEvents({
  events,
  seconds,
  sampleRate,
  volume: 0.18
});
const wav = encodeSnailMusicWav(rendered, sampleRate);
writeFileSync(outputPath, wav);

console.log(`wrote ${outputPath}`);
console.log(`song ${song.id} (${song.label})`);
console.log(`seed ${seed}, seconds ${seconds}, sampleRate ${sampleRate}, events ${events.length}`);
console.log(events.map((entry) => `${entry.note ?? entry.frequency}:${entry.start.toFixed(2)}:${entry.duration}`).join(' '));

if (hasFlag('play')) {
  process.exit(playFile(outputPath));
}
