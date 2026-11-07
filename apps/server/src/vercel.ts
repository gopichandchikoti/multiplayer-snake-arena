import { loadConfig } from './config';
import { createGameServer } from './server';

// Vercel serves the client separately and supplies the public client IP through its proxy.
// Local leaderboard files cannot provide durable storage across function instances.
const game = createGameServer({
  ...loadConfig(process.env),
  staticDir: null,
  leaderboardFile: null,
  trustProxy: true,
});
await game.initialize();

// Export the actual HTTP server so the Node runtime can handle WebSocket upgrades on /ws.
export default game.httpServer;
