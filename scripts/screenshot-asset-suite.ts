import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { chromium } from 'playwright-core';
import { createServer } from 'vite';

import {
  EXPLORER_DEFAULT_SEED,
  createExplorerWorld
} from '../src/world/ExplorerWorld.js';

const CHROMIUM_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable'
];

const DEFAULT_VIEW = 'three-quarter';
const DEFAULT_LOD = 'near';

function parseArgs(argv) {
  const args = {};
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

function getString(args, key, fallback = undefined) {
  return typeof args[key] === 'string' ? args[key] : fallback;
}

function getNumber(args, key, fallback = undefined) {
  if (!(key in args)) {
    return fallback;
  }

  const value = Number(args[key]);
  return Number.isFinite(value) ? value : fallback;
}

function getBoolean(args, key, fallback = false) {
  if (!(key in args)) {
    return fallback;
  }

  return args[key] === true || args[key] === 'true' || args[key] === '1';
}

function clampInteger(value, fallback, min, max) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(numericValue)));
}

function resolveChromiumPath(options) {
  const explicitPath = options.chromiumPath ?? process.env.CHROMIUM_PATH;
  if (explicitPath) {
    if (!existsSync(explicitPath)) {
      throw new Error(`Chromium executable does not exist: ${explicitPath}`);
    }

    return explicitPath;
  }

  const candidate = CHROMIUM_CANDIDATES.find((path) => existsSync(path));
  if (!candidate) {
    throw new Error('No Chromium executable found. Set CHROMIUM_PATH or pass --chromium-path.');
  }

  return candidate;
}

function getPropKindCounts(world) {
  const counts = new Map();
  for (const prop of world.props) {
    counts.set(prop.kind, (counts.get(prop.kind) ?? 0) + 1);
  }

  return counts;
}

function getKinds(options) {
  const world = createExplorerWorld(options.seed);
  const counts = getPropKindCounts(world);
  const requestedKinds = options.kinds.length > 0
    ? options.kinds
    : Array.from(counts.keys()).sort();

  return {
    world,
    counts,
    kinds: requestedKinds.filter((kind) => counts.has(kind))
  };
}

async function startViteServer(verbose = false) {
  const server = await createServer({
    clearScreen: false,
    logLevel: verbose ? 'info' : 'warn',
    server: {
      host: '127.0.0.1',
      open: false
    }
  });

  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    await server.close();
    throw new Error('Unable to resolve Vite dev server address.');
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}/`
  };
}

function withProfileParam(rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.set('profile', '1');
  return url.toString();
}

function buildChromiumArgs() {
  return [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows'
  ];
}

function parseOptions(argv) {
  const args = parseArgs(argv);
  const rawKinds = getString(args, 'kinds', '');
  const outputDir = resolve(getString(args, 'output-dir', 'asset_studio/suite-v1'));
  return {
    seed: clampInteger(getNumber(args, 'seed'), EXPLORER_DEFAULT_SEED, 0, Number.MAX_SAFE_INTEGER),
    outputDir,
    view: getString(args, 'view', DEFAULT_VIEW),
    lod: getString(args, 'lod', DEFAULT_LOD),
    zoom: getNumber(args, 'zoom', 1),
    width: clampInteger(getNumber(args, 'width'), 1280, 320, 7680),
    height: clampInteger(getNumber(args, 'height'), 720, 240, 4320),
    deviceScaleFactor: Math.min(4, Math.max(0.5, Number(getNumber(args, 'device-scale-factor', 1)) || 1)),
    chromiumPath: getString(args, 'chromium-path', undefined),
    url: getString(args, 'url', undefined),
    headful: getBoolean(args, 'headful'),
    verbose: getBoolean(args, 'verbose'),
    kinds: rawKinds.split(',').map((kind) => kind.trim()).filter(Boolean)
  };
}

async function waitForTwoFrames(page) {
  await page.evaluate(() => new Promise((resolveFrame) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolveFrame);
    });
  }));
}

function getOutputPath(outputDir, kind, suffix) {
  return resolve(outputDir, `${kind}-${suffix}.png`);
}

async function runSuite(options) {
  const { world, counts, kinds } = getKinds(options);
  await mkdir(options.outputDir, { recursive: true });
  const vite = options.url ? null : await startViteServer(options.verbose);
  const baseUrl = options.url ?? vite!.url;
  const browser = await chromium.launch({
    executablePath: resolveChromiumPath(options),
    headless: !options.headful,
    args: buildChromiumArgs()
  });
  const metadata: any[] = [];

  try {
    const pageErrors: string[] = [];
    const page = await browser.newPage({
      viewport: {
        width: options.width,
        height: options.height
      },
      deviceScaleFactor: options.deviceScaleFactor
    });

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    if (options.verbose) {
      page.on('console', (message) => {
        console.error(`[browser:${message.type()}] ${message.text()}`);
      });
    }

    await page.goto(withProfileParam(baseUrl), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean((window as any).__battlesnailsProfile?.startAssetStudio));

    for (const kind of kinds) {
      const row: any = {
        kind,
        count: counts.get(kind) ?? 0,
        shots: {}
      };

      for (const collision of [false, true]) {
        const suffix = collision ? 'collision' : 'visual';
        const studio = await page.evaluate((studioOptions) => {
          return (window as any).__battlesnailsProfile.startAssetStudio(studioOptions);
        }, {
          seed: options.seed,
          kind,
          index: 0,
          lod: options.lod,
          view: options.view,
          collision,
          zoom: options.zoom
        });

        await delay(50);
        await waitForTwoFrames(page);

        if (pageErrors.length > 0) {
          throw new Error(`Browser page error: ${pageErrors.join(' | ')}`);
        }

        const output = getOutputPath(options.outputDir, kind, suffix);
        await page.screenshot({
          path: output,
          fullPage: false
        });
        row.shots[suffix] = output;
        row.selected = studio.selected;
        row.renderMode = studio.renderMode;
      }

      metadata.push(row);
      console.log(`${kind}: ${row.shots.visual} | ${row.shots.collision}`);
    }
  } finally {
    await browser.close();
    await vite?.server.close();
  }

  const metadataPath = resolve(options.outputDir, 'metadata.json');
  await writeFile(metadataPath, JSON.stringify({
    seed: options.seed,
    view: options.view,
    lod: options.lod,
    worldgenVersion: world.worldgenVersion,
    propCount: world.props.length,
    assets: metadata
  }, null, 2));
  console.log(`metadata: ${metadataPath}`);
}

const options = parseOptions(process.argv.slice(2));

try {
  await runSuite(options);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
