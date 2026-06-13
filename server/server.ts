// ABOUTME: Express server with Vite integration
// ABOUTME: Handles API routes and serves frontend in dev/prod modes

import 'dotenv/config';
import { createServer, type Server } from 'http';
import express from 'express';
import router from './routes/index';
import { setupVite } from './vite';

const isDev = process.env.COZE_PROJECT_ENV !== 'PROD';
const port = parseInt(process.env.PORT || '5000', 10);
const hostname = process.env.HOSTNAME || 'localhost';

const app = express();

// === Module-level middleware: needed by both standalone server and Vercel ===
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Register API routes
app.use(router);

// Global error handling
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = 'status' in err ? (err as any).status || 500 : 500;
  if (typeof res.status === 'function') {
    res.status(status).json({
      error: err.message || 'Internal server error',
    });
  } else {
    res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
  }
});

export { app };

// === Server-specific: only needed for standalone (not Vercel) ===
const server = createServer(app);

export async function startServer(): Promise<Server> {
  // Request logging (dev only)
  if (isDev) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const ms = Date.now() - start;
        console.log(`${req.method} ${req.url} - ${ms}ms`);
      });
      next();
    });
  }

  // Integrate Vite (dev mode) or static file serving (production mode)
  await setupVite(app);

  server.once('error', err => {
    console.error('Server error:', err);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`\n✅ Server running at http://${hostname}:${port}`);
    console.log(`📋 Environment: ${isDev ? 'development' : 'production'}\n`);
  });

  return server;
}

// Only auto-start when not running on Vercel (Vercel uses serverless functions)
if (!process.env.VERCEL) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}