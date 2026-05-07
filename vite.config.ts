import { defineConfig, type Plugin } from 'vite';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'path';

const ANNOYING_LECTURER_SOURCE_PATH = '/home/joe/skunks/personal_stt_stack/jfk.wav';
const ANNOYING_LECTURER_PUBLIC_DOMAIN_URL =
  'https://commons.wikimedia.org/wiki/Special:Redirect/file/JFK_inaugural_address.ogg';
const ANNOYING_LECTURER_DEV_ROUTE = '/dev-audio/annoying-lecturer-jfk.ogg';
const ANNOYING_LECTURER_LEGACY_DEV_ROUTE = '/dev-audio/annoying-lecturer-jfk.wav';

function readHttpsConfigFromEnv() {
  const keyPath = process.env.BATTLESNAILS_HTTPS_KEY ?? process.env.SSL_KEY_FILE;
  const certPath = process.env.BATTLESNAILS_HTTPS_CERT ?? process.env.SSL_CRT_FILE;
  if (!keyPath || !certPath) {
    return null;
  }

  return {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath)
  };
}

function createLocalMultiplayerDevPlugin(): Plugin {
  let localServer: any = null;
  let startedByPlugin = false;

  return {
    name: 'battlesnails-localhost-multiplayer',
    apply: 'serve' as const,
    async configureServer(viteServer: any) {
      if (localServer || startedByPlugin) {
        return;
      }

      const { createLocalMultiplayerServer } = await import('./server/createLocalMultiplayerServer.js');
      const tls = readHttpsConfigFromEnv();
      localServer = createLocalMultiplayerServer({
        port: 2567,
        host: '0.0.0.0',
        tls
      });

      try {
        await localServer.start();
        startedByPlugin = true;
        const protocol = tls ? 'wss' : 'ws';
        viteServer.config.logger.info(
          `BattleSnails multiplayer server listening on ${protocol}://localhost:2567 and your LAN IP on port 2567`,
          { clear: false }
        );
      } catch (error: any) {
        localServer = null;

        if (error?.code === 'EADDRINUSE') {
          viteServer.config.logger.info(
            'BattleSnails multiplayer server already running on port 2567',
            { clear: false }
          );
          return;
        }

        throw error;
      }

      const stopServer = async () => {
        if (!startedByPlugin || !localServer) {
          return;
        }

        const serverToStop = localServer;
        localServer = null;
        startedByPlugin = false;
        await serverToStop.stop();
      };

      viteServer.httpServer?.once('close', () => {
        void stopServer();
      });
    }
  };
}

function createLocalAudioAssetDevPlugin(): Plugin {
  return {
    name: 'battlesnails-local-audio-assets',
    apply: 'serve' as const,
    configureServer(viteServer: any) {
      viteServer.middlewares.use(ANNOYING_LECTURER_DEV_ROUTE, (_request: any, response: any) => {
        response.writeHead(302, { location: ANNOYING_LECTURER_PUBLIC_DOMAIN_URL });
        response.end();
      });

      viteServer.middlewares.use(ANNOYING_LECTURER_LEGACY_DEV_ROUTE, (_request: any, response: any) => {
        if (!existsSync(ANNOYING_LECTURER_SOURCE_PATH)) {
          response.statusCode = 404;
          response.end('Missing local lecturer audio asset.');
          return;
        }

        const stat = statSync(ANNOYING_LECTURER_SOURCE_PATH);
        response.setHeader('content-type', 'audio/wav');
        response.setHeader('content-length', `${stat.size}`);
        response.setHeader('cache-control', 'no-store');
        createReadStream(ANNOYING_LECTURER_SOURCE_PATH).pipe(response);
      });
    }
  };
}

const httpsConfig = readHttpsConfigFromEnv();

export default defineConfig({
  plugins: [createLocalAudioAssetDevPlugin(), createLocalMultiplayerDevPlugin()],
  server: {
    host: '0.0.0.0',
    open: true,
    https: httpsConfig ?? undefined
  },
  preview: {
    host: '0.0.0.0',
    https: httpsConfig ?? undefined
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});
