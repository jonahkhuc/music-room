import 'dotenv/config';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIO } from 'socket.io';
import { setupSocketHandlers } from './server/socket-handler';
import type { ServerToClientEvents, ClientToServerEvents } from './types';

const dev  = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT ?? '3000', 10);

const app    = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIO<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
    // Keep traffic flowing more often than typical proxy idle timeouts
    // (Cloudflare free ≈100s, many nginx defaults ≈60s) so the upstream
    // doesn't silently drop an "idle" WebSocket.
    pingInterval: 20000,
    pingTimeout:  25000,
  });

  setupSocketHandlers(io);

  httpServer.listen(port, () => {
    console.log(`> Music Room ready on http://localhost:${port}`);
  });
});
