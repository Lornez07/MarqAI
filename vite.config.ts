import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Dev-only adapter so `npm run dev` exercises the real /api/chat handler.
 * Production uses Vercel's function runtime; this exists because Vite does not
 * serve api/ routes and `vercel dev` requires a linked project.
 */
function apiRoutes(mode: string): Plugin {
  return {
    name: 'marq-api-routes',
    configureServer(server) {
      // Server-only keys live in .env.local without a VITE_ prefix, so Vite does
      // not expose them to the client. Copy them into process.env for the handler.
      const env = loadEnv(mode, process.cwd(), '');
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }

      server.middlewares.use('/api/chat', async (req: IncomingMessage, res: ServerResponse) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);

        let body: unknown;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          body = undefined;
        }

        const adapter = {
          status(code: number) {
            res.statusCode = code;
            return adapter;
          },
          setHeader(name: string, value: string) {
            res.setHeader(name, value);
          },
          json(payload: unknown) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(payload));
          },
          write(chunk: string) {
            return res.write(chunk);
          },
          end() {
            res.end();
          },
          flushHeaders() {
            res.flushHeaders();
          },
        };

        try {
          const module = await server.ssrLoadModule('/api/chat.ts');
          await module.default(
            {
              method: req.method,
              headers: req.headers,
              body,
              on: (event: 'close', listener: () => void) => req.on(event, listener),
            },
            adapter,
          );
        } catch (error) {
          console.error('[api/chat] dev handler failed:', error);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
          }
          res.end(JSON.stringify({ error: 'Local proxy failed.', code: 'DEV_PROXY_ERROR' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), apiRoutes(mode)],
}));
