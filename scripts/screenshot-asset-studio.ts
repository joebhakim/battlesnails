import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const CHROMIUM_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable'
];

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

function buildChromiumArgs(options) {
  const args = [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows'
  ];

  if (options.gl === 'swiftshader') {
    args.push('--use-gl=swiftshader');
  }

  return args;
}

function withProfileParam(rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.set('profile', '1');
  return url.toString();
}

function getDefaultOutputPath(options) {
  const idPart = options.id ? `-${options.id}` : `-${options.kind}-index${options.index}`;
  return resolve(
    process.cwd(),
    'asset_studio',
    `${options.seed}${idPart}-${options.lod}-${options.view}.png`
  );
}

function withOutputSuffix(outputPath, suffix) {
  return outputPath.toLowerCase().endsWith('.png')
    ? `${outputPath.slice(0, -4)}-${suffix}.png`
    : `${outputPath}-${suffix}.png`;
}

function getShotSpecs(options) {
  if (options.visualOnly) {
    return [{ collision: false, suffix: 'visual', output: options.output }];
  }

  if (options.collisionOnly) {
    return [{ collision: true, suffix: 'collision', output: options.output }];
  }

  if (options.single) {
    return [{ collision: options.collision, suffix: options.collision ? 'collision' : 'visual', output: options.output }];
  }

  return [
    { collision: false, suffix: 'visual', output: withOutputSuffix(options.output, 'visual') },
    { collision: true, suffix: 'collision', output: withOutputSuffix(options.output, 'collision') }
  ];
}

function parseAssetShotArgs(argv) {
  const args = parseArgs(argv);
  const seed = clampInteger(getNumber(args, 'seed'), 137, 0, Number.MAX_SAFE_INTEGER);
  const index = clampInteger(getNumber(args, 'index', getNumber(args, 'n')), 0, 0, Number.MAX_SAFE_INTEGER);
  const kind = getString(args, 'kind', getString(args, 'asset', 'dry_leaf_patch'));
  const id = getString(args, 'id', undefined);
  const lod = getString(args, 'lod', 'near');
  const view = getString(args, 'view', 'three-quarter');
  const options = {
    seed,
    index,
    kind,
    id,
    lod,
    view,
    collision: getBoolean(args, 'collision'),
    labels: getBoolean(args, 'labels', getBoolean(args, 'label')),
    rotationY: getNumber(args, 'rotation-y', undefined),
    zoom: getNumber(args, 'zoom', 1),
    width: clampInteger(getNumber(args, 'width'), 1280, 320, 7680),
    height: clampInteger(getNumber(args, 'height'), 720, 240, 4320),
    deviceScaleFactor: Math.min(4, Math.max(0.5, Number(getNumber(args, 'device-scale-factor', 1)) || 1)),
    chromiumPath: getString(args, 'chromium-path', undefined),
    url: getString(args, 'url', undefined),
    output: getString(args, 'output', undefined),
    gl: getString(args, 'gl', 'default'),
    headful: getBoolean(args, 'headful'),
    verbose: getBoolean(args, 'verbose'),
    single: getBoolean(args, 'single'),
    visualOnly: getBoolean(args, 'visual-only'),
    collisionOnly: getBoolean(args, 'collision-only')
  };

  return {
    ...options,
    output: resolve(options.output ?? getDefaultOutputPath(options))
  };
}

async function waitForTwoFrames(page) {
  await page.evaluate(() => new Promise((resolveFrame) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolveFrame);
    });
  }));
}

async function runAssetStudioShot(options) {
  const vite = options.url ? null : await startViteServer(options.verbose);
  const baseUrl = options.url ?? vite!.url;
  const profileUrl = withProfileParam(baseUrl);
  const browser = await chromium.launch({
    executablePath: resolveChromiumPath(options),
    headless: !options.headful,
    args: buildChromiumArgs(options)
  });

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

    await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean((window as any).__battlesnailsProfile?.startAssetStudio));

    const shots: any[] = [];
    for (const shot of getShotSpecs(options)) {
      const studio = await page.evaluate((studioOptions) => {
        return (window as any).__battlesnailsProfile.startAssetStudio(studioOptions);
      }, {
        seed: options.seed,
        kind: options.kind,
        id: options.id,
        index: options.index,
        lod: options.lod,
        view: options.view,
        collision: shot.collision,
        labels: options.labels,
        rotationY: options.rotationY,
        zoom: options.zoom
      });

      await delay(50);
      await waitForTwoFrames(page);

      if (pageErrors.length > 0) {
        throw new Error(`Browser page error: ${pageErrors.join(' | ')}`);
      }

      await mkdir(dirname(shot.output), { recursive: true });
      await page.screenshot({
        path: shot.output,
        fullPage: false
      });

      shots.push({
        studio,
        output: shot.output,
        collision: shot.collision,
        suffix: shot.suffix
      });
    }

    return {
      shots,
      url: profileUrl
    };
  } finally {
    await browser.close();
    await vite?.server.close();
  }
}

const options = parseAssetShotArgs(process.argv.slice(2));

try {
  const result = await runAssetStudioShot(options);
  for (const shot of result.shots) {
    console.log(`Asset Studio ${shot.suffix}: ${shot.output}`);
  }
  const studio = result.shots[0]?.studio;
  if (studio) {
    console.log(`asset: ${studio.selected.kind} · ${studio.selected.id} · candidate ${studio.selected.index + 1}/${studio.selected.candidateCount}`);
    console.log(`render: ${studio.renderMode} · view ${studio.options.view} · lod ${studio.options.lod} · seed ${studio.world.seed} · worldgen v${studio.world.worldgenVersion}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
