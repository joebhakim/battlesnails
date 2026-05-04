import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

import { chromium } from 'playwright-core';
import { createServer } from 'vite';

import {
  createBrowserArenaProfileResult,
  evaluateBrowserArenaThresholds,
  formatBrowserArenaProfile,
  parseBrowserArenaArgs
} from '../src/sim/BrowserArenaPerformance.js';

const CHROMIUM_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable'
];

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

function withProfileParam(rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.set('profile', '1');
  return url.toString();
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

async function runBrowserArenaProfile(options) {
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
    await page.waitForFunction(() => Boolean((window as any).__battlesnailsProfile?.startArena));

    const startResult = await page.evaluate((profileOptions) => {
      const profile = (window as any).__battlesnailsProfile;
      const result = profileOptions.mode === 'adventure'
        ? profile.startAdventure({
          seed: profileOptions.seed,
          npcCount: profileOptions.npcCount
        })
        : profile.startArena({
          botCount: profileOptions.botCount,
          stagePreset: profileOptions.stagePreset
        });
      profile.installInputDriver({
        mode: profileOptions.inputMode
      });
      profile.installFrameProfiler({
        glFinish: profileOptions.glFinish,
        sceneSampleEvery: profileOptions.sceneSampleEvery
      });
      profile.resetSamples();
      return result;
    }, {
      mode: options.mode,
      botCount: options.botCount,
      npcCount: options.npcCount,
      stagePreset: options.stagePreset,
      seed: options.seed,
      inputMode: options.inputMode,
      glFinish: options.glFinish,
      sceneSampleEvery: options.sceneSampleEvery
    });

    await delay(options.warmupSeconds * 1000);
    await page.evaluate(() => {
      (window as any).__battlesnailsProfile.resetSamples();
    });
    await delay(options.seconds * 1000);

    const payload = await page.evaluate(() => {
      const profile = (window as any).__battlesnailsProfile;
      return {
        samples: profile.getSamples(),
        finalState: profile.getState()
      };
    });

    if (pageErrors.length > 0) {
      throw new Error(`Browser page error: ${pageErrors.join(' | ')}`);
    }

    if (payload.samples.length === 0) {
      throw new Error('No browser frame samples were collected.');
    }

    return createBrowserArenaProfileResult({
      options: {
        ...options,
        botCount: startResult.options.botCount ?? options.botCount,
        npcCount: startResult.options.npcCount ?? options.npcCount,
        stagePreset: startResult.options.stagePreset ?? options.stagePreset,
        seed: startResult.options.seed ?? options.seed
      },
      samples: payload.samples,
      finalState: payload.finalState,
      startedFromUrl: profileUrl
    });
  } finally {
    await browser.close();
    await vite?.server.close();
  }
}

const options = parseBrowserArenaArgs(process.argv.slice(2));

try {
  const result = await runBrowserArenaProfile(options);
  const failures = evaluateBrowserArenaThresholds(result, options.thresholds);

  if (options.json) {
    console.log(JSON.stringify({ ...result, failures }, null, 2));
  } else {
    console.log(formatBrowserArenaProfile(result, failures));
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
