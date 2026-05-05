import { readFileSync } from 'node:fs';
import { createLocalMultiplayerServer } from './createLocalMultiplayerServer.js';

const port = Number(process.env.PORT || 2567);
const host = process.env.HOST || '0.0.0.0';
const tlsKeyPath = process.env.BATTLESNAILS_HTTPS_KEY ?? process.env.SSL_KEY_FILE;
const tlsCertPath = process.env.BATTLESNAILS_HTTPS_CERT ?? process.env.SSL_CRT_FILE;
const tls = tlsKeyPath && tlsCertPath
  ? {
    key: readFileSync(tlsKeyPath),
    cert: readFileSync(tlsCertPath)
  }
  : null;
const server = createLocalMultiplayerServer({ port, host, tls });

server.start()
  .then((address) => {
    const actualPort = typeof address === 'object' && address ? address.port : port;
    const listenHost = host === '0.0.0.0' ? 'all interfaces' : host;
    const protocol = tls ? 'wss' : 'ws';
    console.log(`BattleSnails multiplayer server listening on ${protocol}://${listenHost}:${actualPort}`);
    console.log(`Local client URL: ${protocol}://localhost:${actualPort}`);
  })
  .catch((error) => {
    console.error(`Failed to start BattleSnails multiplayer server on port ${port}`);
    console.error(error);
    process.exit(1);
  });

process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});
