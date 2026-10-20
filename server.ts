/**
 * Local / Node server.
 *   npm run dev    -> Express API + Vite dev middleware (hot reload)
 *   npm run build && npm start -> Express API + built static files
 *
 * On Vercel this file is NOT used; api/analyze.ts is used instead.
 * Both call the same engine in api/_lib/analyzer.ts.
 */
import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  AnalyzeError,
  HTTP_STATUS,
  analyzeDocument,
  getConfiguredModels,
  isApiKeyConfigured,
} from './api/_lib/analyzer.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');

const app = express();
app.disable('x-powered-by');
// base64 inflates files by ~33%; the analyzer enforces the exact limit.
app.use(express.json({ limit: '6mb' }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    apiKeyConfigured: isApiKeyConfigured(),
    models: getConfiguredModels(),
    time: new Date().toISOString(),
  });
});

app.post('/api/analyze', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const result = await analyzeDocument(req.body ?? {});
    res.json(result);
  } catch (err) {
    const e = err instanceof AnalyzeError ? err : new AnalyzeError('UNKNOWN');
    if (!(err instanceof AnalyzeError)) console.error('[analyze] unexpected error:', err);
    res.status(HTTP_STATUS[e.code] ?? 500).json({ error: e.message, code: e.code });
  }
});

app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'API route not found', code: 'UNKNOWN' });
});

// Body-parser errors (e.g. payload too large / bad JSON) -> JSON the client understands.
app.use((err: any, _req: Request, res: Response, next: express.NextFunction) => {
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'The file is too large.', code: 'TOO_LARGE' });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid request body.', code: 'NO_IMAGE' });
    return;
  }
  next(err);
});

async function start() {
  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (!fs.existsSync(distPath)) {
      console.error('Production build not found. Run "npm run build" first.');
      process.exit(1);
    }
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MediInterpret AI running on http://localhost:${PORT} (${isProduction ? 'production' : 'development'})`);
    if (!isApiKeyConfigured()) {
      console.warn('WARNING: GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.');
    }
  });
}

start();
