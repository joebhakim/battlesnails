import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

function parseArgs(argv) {
  const args: any = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split('=');
    const nextToken = argv[index + 1];
    const value = inlineValue !== undefined
      ? inlineValue
      : nextToken && !nextToken.startsWith('--')
        ? argv[++index]
        : true;
    args[rawKey] = value;
  }
  return args;
}

function getImageMagickCommand() {
  for (const command of ['magick', 'convert']) {
    try {
      execFileSync(command, ['-version'], { stdio: 'ignore' });
      return command;
    } catch {
      // Try the next common ImageMagick entrypoint.
    }
  }

  throw new Error('ImageMagick is required for asset jaccard metrics. Install magick/convert.');
}

function identify(command, imagePath) {
  const args = command === 'magick'
    ? ['identify', '-format', '%w %h', imagePath]
    : ['-format', '%w %h', imagePath];
  const [width, height] = execFileSync(command, args, { encoding: 'utf8' })
    .trim()
    .split(/\s+/)
    .map((value) => Number(value));
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Unable to identify image dimensions: ${imagePath}`);
  }
  return { width, height };
}

function readRgba(command, imagePath) {
  const { width, height } = identify(command, imagePath);
  const args = command === 'magick'
    ? [imagePath, '-depth', '8', 'rgba:-']
    : [imagePath, '-depth', '8', 'rgba:-'];
  const data = execFileSync(command, args, {
    encoding: 'buffer',
    maxBuffer: width * height * 4 + 1024
  });
  return { width, height, data };
}

function isVisualPixel(r, g, b, a) {
  if (a < 24) {
    return false;
  }

  const background = { r: 169, g: 183, b: 186 };
  const distance = Math.hypot(r - background.r, g - background.g, b - background.b);
  return distance > 24;
}

function isCollisionPixel(r, g, b, a) {
  if (a < 24) {
    return false;
  }

  return g > 88 && b > 92 && b > r + 26 && g > r + 18;
}

function measurePair(command, kind, visualPath, collisionPath) {
  const visual = readRgba(command, visualPath);
  const collision = readRgba(command, collisionPath);
  if (visual.width !== collision.width || visual.height !== collision.height) {
    throw new Error(`Image dimensions differ for ${kind}`);
  }

  let visualPixels = 0;
  let collisionPixels = 0;
  let intersection = 0;
  let union = 0;

  for (let offset = 0; offset < visual.data.length; offset += 4) {
    const visualMask = isVisualPixel(
      visual.data[offset],
      visual.data[offset + 1],
      visual.data[offset + 2],
      visual.data[offset + 3]
    );
    const collisionMask = isCollisionPixel(
      collision.data[offset],
      collision.data[offset + 1],
      collision.data[offset + 2],
      collision.data[offset + 3]
    );

    if (visualMask) {
      visualPixels += 1;
    }
    if (collisionMask) {
      collisionPixels += 1;
    }
    if (visualMask && collisionMask) {
      intersection += 1;
    }
    if (visualMask || collisionMask) {
      union += 1;
    }
  }

  const jaccard = union > 0 ? intersection / union : 1;
  const visualMissRate = visualPixels > 0 ? (visualPixels - intersection) / visualPixels : 0;
  const collisionExcessRate = collisionPixels > 0 ? (collisionPixels - intersection) / collisionPixels : 0;
  return {
    kind,
    visualPixels,
    collisionPixels,
    intersection,
    union,
    jaccard: Number(jaccard.toFixed(4)),
    visualMissRate: Number(visualMissRate.toFixed(4)),
    collisionExcessRate: Number(collisionExcessRate.toFixed(4))
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputDir = resolve(String(args.dir ?? args.input ?? 'asset_studio/review-v4'));
  const outputPath = resolve(String(args.output ?? `${inputDir}/collision-jaccard.json`));
  const command = getImageMagickCommand();
  const visualFiles = readdirSync(inputDir)
    .filter((file) => file.endsWith('-visual.png') && !file.startsWith('contact-'))
    .sort();
  const results = [];

  for (const file of visualFiles) {
    const kind = basename(file, '-visual.png');
    const visualPath = resolve(inputDir, file);
    const collisionPath = resolve(inputDir, `${kind}-collision.png`);
    if (!existsSync(collisionPath)) {
      continue;
    }

    results.push(measurePair(command, kind, visualPath, collisionPath));
  }

  results.sort((left, right) => left.jaccard - right.jaccard || left.kind.localeCompare(right.kind));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({
    inputDir,
    metric: '2d screenshot-mask Jaccard between visual silhouette and cyan collision overlay',
    results
  }, null, 2)}\n`);

  for (const row of results) {
    console.log(`${row.kind.padEnd(18)} j=${row.jaccard.toFixed(4)} miss=${row.visualMissRate.toFixed(4)} excess=${row.collisionExcessRate.toFixed(4)}`);
  }
  console.log(`wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
