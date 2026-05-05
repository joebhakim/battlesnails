import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  EXPLORER_DEFAULT_SEED,
  createExplorerMapGrids
} from '../src/world/ExplorerWorld.js';

function parseSeed(value) {
  const numericSeed = Number(value);
  return Number.isFinite(numericSeed) ? numericSeed : value;
}

function parseNumber(value, label) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new Error(`Expected a number for ${label}, got "${value}".`);
  }

  return numericValue;
}

function takeFlagValue(args, index, label) {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing value for ${label}.`);
  }

  return value;
}

function parseArgs(argv) {
  const options: any = {};
  const positional = [];
  let seed = EXPLORER_DEFAULT_SEED;
  let seedWasFlagged = false;
  let outputPath = null;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    switch (arg) {
      case '--help':
      case '-h':
        help = true;
        break;
      case '--seed':
        seed = parseSeed(takeFlagValue(argv, index, arg));
        seedWasFlagged = true;
        index += 1;
        break;
      case '--cell-size':
        options.cellSize = parseNumber(takeFlagValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--radius':
        options.radius = parseNumber(takeFlagValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--shape':
        options.shape = takeFlagValue(argv, index, arg);
        index += 1;
        break;
      case '--hex-radius':
        options.hexRadius = parseNumber(takeFlagValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--hex-rotation':
        options.hexRotation = parseNumber(takeFlagValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--hex-rotation-deg':
        options.hexRotation = (parseNumber(takeFlagValue(argv, index, arg), arg) * Math.PI) / 180;
        index += 1;
        break;
      case '--center-x':
        options.centerX = parseNumber(takeFlagValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--center-z':
        options.centerZ = parseNumber(takeFlagValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--output':
        outputPath = takeFlagValue(argv, index, arg);
        index += 1;
        break;
      default:
        throw new Error(`Unknown option ${arg}.`);
    }
  }

  if (!seedWasFlagged && positional[0] !== undefined) {
    seed = parseSeed(positional[0]);
  }

  if (options.cellSize === undefined && positional[1] !== undefined) {
    options.cellSize = parseNumber(positional[1], 'legacy cell size');
  }

  return { help, seed, options, outputPath };
}

function renderUsage() {
  return [
    'Usage:',
    '  npm run map:explorer -- [seed] [cellSize]',
    '  npm run map:explorer -- --seed 137 --cell-size 75 --shape hex --hex-radius 850 --hex-rotation-deg 30',
    '',
    'Options:',
    '  --shape circle|hex',
    '  --radius <world units>',
    '  --hex-radius <world units>',
    '  --hex-rotation <radians>',
    '  --hex-rotation-deg <degrees>',
    '  --center-x <world units>',
    '  --center-z <world units>',
    '  --output <path>'
  ].join('\n');
}

function renderExplorerMap(grids) {
  const lines = [
    `Explorer worldgen v${grids.worldgenVersion} seed ${grids.seed}`,
    `shape ${grids.shape}, cellSize ${grids.cellSize}, ${grids.width} x ${grids.height}`
  ];

  if (grids.clip?.shape === 'hex') {
    lines.push(
      `hexRadius ${grids.clip.hexRadius}, rotation ${grids.clip.hexRotationDegrees}deg, center (${grids.clip.centerX}, ${grids.clip.centerZ})`
    );
  } else if (grids.clip?.shape === 'hex_cluster') {
    lines.push(
      `hexRadius ${grids.clip.hexRadius}, tiles ${grids.clip.tileCount}, outerRadius ${grids.clip.radius}`
    );
  } else if (grids.clip?.shape === 'coastal_hex_cluster') {
    lines.push(
      `hexRadius ${grids.clip.hexRadius}, tiles ${grids.clip.tileCount}, outerRadius ${grids.clip.radius}, beachWidth ${grids.clip.beachWidth}, waterMargin ${grids.clip.waterMargin}`
    );
  } else {
    lines.push(`radius ${grids.clip?.radius ?? grids.radius}`);
  }

  lines.push(
    '',
    'features',
    grids.featureGrid,
    '',
    'elevation',
    grids.elevationGrid,
    '',
    'legend'
  );

  for (const [key, entry] of Object.entries(grids.legend.features)) {
    lines.push(`${(entry as any).symbol} ${key}: ${(entry as any).label}`);
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const { help, seed, options, outputPath } = parseArgs(process.argv.slice(2));

  if (help) {
    console.log(renderUsage());
    return;
  }

  const grids = createExplorerMapGrids(seed, options);
  const output = renderExplorerMap(grids);

  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output, 'utf8');
    console.log(outputPath);
    return;
  }

  console.log(output);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
