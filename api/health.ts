import { getConfiguredModels, isApiKeyConfigured } from './_lib/analyzer.js';

/** GET /api/health : quick check that the server is up and the key is set. Never returns the key. */
export default function handler(_req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    status: 'ok',
    apiKeyConfigured: isApiKeyConfigured(),
    models: getConfiguredModels(),
    time: new Date().toISOString(),
  });
}
