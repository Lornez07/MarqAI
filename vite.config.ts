import { defineConfig, loadEnv, type Plugin, type ViteDevServer, type PreviewServer } from 'vite';
import react from '@vitejs/plugin-react';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

type RouteHandler = (req: unknown, res: unknown) => Promise<void>;

/**
 * Dev/preview adapter so both `npm run dev` and `npm run preview` exercise the
 * real /api/chat handler. Production uses Vercel's function runtime.
 */
function apiRoutes(mode: string): Plugin {
  const attach = (server: ViteDevServer | PreviewServer) => {
    // Server-only keys live in .env.local without a VITE_ prefix, so Vite does
    // not expose them to the client. Copy them into process.env for the handler.
    const env = loadEnv(mode, process.cwd(), '');
    for (const [key, value] of Object.entries(env)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }

    // Dev has the module graph; preview has to import the file directly.
    const loadHandler = async (): Promise<RouteHandler> => {
      if ('ssrLoadModule' in server) {
        const module = await server.ssrLoadModule('/api/chat.ts');
        return module.default as RouteHandler;
      }
      const entry = pathToFileURL(resolve(process.cwd(), 'api/chat.ts')).href;
      const module = (await import(/* @vite-ignore */ entry)) as { default: RouteHandler };
      return module.default;
    };

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
        const handler = await loadHandler();
        await handler(
          {
            method: req.method,
            headers: req.headers,
            body,
            on: (event: 'close', listener: () => void) => req.on(event, listener),
          },
          adapter,
        );
      } catch (error) {
        console.error('[api/chat] local handler failed:', error);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
        res.end(JSON.stringify({ error: 'Local proxy failed.', code: 'DEV_PROXY_ERROR' }));
      }
    });
  };

  return {
    name: 'marq-api-routes',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), apiRoutes(mode)],
}));
