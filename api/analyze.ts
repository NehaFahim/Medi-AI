import { AnalyzeError, HTTP_STATUS, analyzeDocument } from './_lib/analyzer.js';

/**
 * Vercel serverless function: POST /api/analyze
 * Body: { base64Image: string, mimeType: string }
 * The 60 s maxDuration is configured in vercel.json.
 */
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed', code: 'UNKNOWN' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const result = await analyzeDocument(body ?? {});
    return res.status(200).json(result);
  } catch (err) {
    const e = err instanceof AnalyzeError ? err : new AnalyzeError('UNKNOWN');
    if (!(err instanceof AnalyzeError)) console.error('[analyze] unexpected error:', err);
    return res.status(HTTP_STATUS[e.code] ?? 500).json({ error: e.message, code: e.code });
  }
}
