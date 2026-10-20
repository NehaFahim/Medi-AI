import type { AnalysisResponse, ApiErrorBody, ErrorCode } from '../../shared/types';
import type { PreparedFile } from './imagePrep';

export type { AnalysisResponse } from '../../shared/types';

/** Slightly above the server budget (52 s) so the server's own TIMEOUT answer arrives first. */
const CLIENT_TIMEOUT_MS = 65_000;

export class AnalysisError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode) {
    super(code);
    this.code = code;
  }
}

const KNOWN_CODES = new Set<string>([
  'NO_IMAGE', 'BAD_TYPE', 'TOO_LARGE', 'NO_KEY', 'BAD_KEY', 'REGION', 'QUOTA', 'OVERLOADED',
  'TIMEOUT', 'BAD_MODEL', 'UNREADABLE', 'BAD_RESPONSE', 'UNKNOWN',
]);

function codeFromStatus(status: number): ErrorCode {
  if (status === 404) return 'NO_BACKEND';
  if (status === 413) return 'TOO_LARGE';
  if (status === 429) return 'QUOTA';
  if (status === 504) return 'TIMEOUT';
  if (status === 503) return 'OVERLOADED';
  return 'UNKNOWN';
}

/**
 * Sends the prepared document to /api/analyze.
 * Pass an AbortSignal to let the user cancel; a hard timeout is applied too.
 */
export async function analyzeMedicalDocument(
  file: PreparedFile,
  signal?: AbortSignal,
): Promise<AnalysisResponse> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, CLIENT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  let status = 0;
  let bodyText = '';

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image: file.base64, mimeType: file.mimeType }),
      signal: controller.signal,
    });
    status = res.status;
    bodyText = await res.text();
  } catch {
    if (timedOut) throw new AnalysisError('TIMEOUT');
    if (signal?.aborted) throw new AnalysisError('CANCELLED');
    throw new AnalysisError('NETWORK');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  // The body may not be JSON (e.g. a platform timeout/413 page), so parse defensively.
  let json: unknown = null;
  try {
    json = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    json = null;
  }

  if (status >= 200 && status < 300 && json && typeof json === 'object' && 'patientSummary' in json) {
    return json as AnalysisResponse;
  }

  const body = json as Partial<ApiErrorBody> | null;
  if (body?.code && KNOWN_CODES.has(body.code)) throw new AnalysisError(body.code);
  throw new AnalysisError(codeFromStatus(status));
}
