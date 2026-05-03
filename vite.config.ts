import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';

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
      localServer = createLocalMultiplayerServer({
        port: 2567,
        host: '0.0.0.0'
      });

      try {
        await localServer.start();
        startedByPlugin = true;
        viteServer.config.logger.info(
          'BattleSnails multiplayer server listening on ws://localhost:2567 and your LAN IP on port 2567',
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

export default defineConfig({
  plugins: [createLocalMultiplayerDevPlugin()],
  server: {
    host: '0.0.0.0',
    open: true
  },
  preview: {
    host: '0.0.0.0'
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
