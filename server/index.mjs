import { createLocalMultiplayerServer } from './createLocalMultiplayerServer.mjs';

const port = Number(process.env.PORT || 2567);
const host = process.env.HOST || '0.0.0.0';
const server = createLocalMultiplayerServer({ port, host });

server.start()
  .then((address) => {
    const actualPort = typeof address === 'object' && address ? address.port : port;
    const listenHost = host === '0.0.0.0' ? 'all interfaces' : host;
    console.log(`BattleSnails multiplayer server listening on ${listenHost}:${actualPort}`);
    console.log(`Local client URL: ws://localhost:${actualPort}`);
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
