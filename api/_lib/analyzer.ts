/**
 * Shared analysis engine used by BOTH the Vercel function (api/analyze.ts)
 * and the local/Node server (server.ts), so the prompt, model handling,
 * retries and error mapping can never drift apart again.
 *
 * Files in an `_`-prefixed folder are not exposed as Vercel endpoints.
 */
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { Schema } from '@google/genai';
import type {
  AnalysisItem,
  AnalysisResponse,
  Bilingual,
  ErrorCode,
  ResultStatus,
  UrgencyLevel,
} from '../../shared/types.js';

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

const DEFAULT_MODEL = 'gemini-3.8-flash';
const DEFAULT_FALLBACK_MODEL = 'gemini-3.6-flash';

/** Whole request budget. Keep below the hosting limit (Vercel maxDuration = 60s). */
const TOTAL_BUDGET_MS = Number(process.env.ANALYZE_TIMEOUT_MS) || 52_000;
/** One model attempt may not use the entire budget, so a fallback still has time. */
const ATTEMPT_CAP_MS = 40_000;
const MAX_ATTEMPTS_PER_MODEL = 2;

/** ~3 MB of binary data. Vercel rejects request bodies above 4.5 MB. */
export const MAX_BASE64_CHARS = 4_000_000;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

export const DISCLAIMER: Bilingual = {
  en: 'This is an automated educational summary, not a medical diagnosis or medical advice. Always consult a qualified doctor or pharmacist before starting, stopping or changing any medicine.',
  ur: 'یہ ایک خودکار تعلیمی خلاصہ ہے، طبی تشخیص یا طبی مشورہ نہیں۔ کوئی بھی دوا شروع کرنے، بند کرنے یا تبدیل کرنے سے پہلے اپنے مستند ڈاکٹر یا فارماسسٹ سے ضرور مشورہ کریں۔',
};

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

const MESSAGES: Record<string, string> = {
  NO_IMAGE: 'No document was provided.',
  BAD_TYPE: 'Unsupported file type. Please upload a JPG, PNG, WebP image or a PDF.',
  TOO_LARGE: 'The file is too large. Please use a smaller image or a PDF under 3 MB.',
  NO_KEY: 'The server has no GEMINI_API_KEY configured.',
  BAD_KEY: 'The Gemini API key is invalid, suspended or blocked.',
  REGION: 'The Gemini API is not available from the server region.',
  QUOTA: 'The Gemini usage quota or rate limit was reached.',
  OVERLOADED: 'The AI service is busy right now.',
  TIMEOUT: 'The analysis took too long.',
  BAD_MODEL: 'The configured Gemini model is not available.',
  UNREADABLE: 'The document could not be read clearly or is not a medical document.',
  BAD_RESPONSE: 'The AI returned an incomplete answer.',
  UNKNOWN: 'Unexpected error while analyzing the document.',
};

export const HTTP_STATUS: Record<ErrorCode, number> = {
  NO_IMAGE: 400,
  BAD_TYPE: 400,
  TOO_LARGE: 413,
  NO_KEY: 500,
  BAD_KEY: 502,
  REGION: 502,
  QUOTA: 429,
  OVERLOADED: 503,
  TIMEOUT: 504,
  BAD_MODEL: 502,
  UNREADABLE: 422,
  BAD_RESPONSE: 502,
  UNKNOWN: 500,
  // browser-only codes (never produced here, listed for completeness)
  NETWORK: 500,
  NO_BACKEND: 404,
  CANCELLED: 499,
  UNSUPPORTED_IMAGE: 400,
};

export class AnalyzeError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message?: string) {
    super(message ?? MESSAGES[code] ?? MESSAGES.UNKNOWN);
    this.name = 'AnalyzeError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Prompt + schema                                                     */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are MediInterpret AI, a careful, NON-DIAGNOSTIC medical document interpreter.
You receive ONE photo or PDF of a medical prescription, lab report or similar healthcare document and explain it in simple, reassuring language in BOTH English ("en") and Urdu ("ur").

WHAT TO DO
1. Read the document with your vision capabilities. Use ONLY what is actually visible in it.
2. Prescriptions: list each medicine (medicineName, dosage, timing) exactly as written, with a short plain-language note on what that kind of medicine is generally used for.
3. Lab reports: list each test result (term, value with unit, referenceRange) exactly as printed. Set status to "Low", "Normal" or "High" ONLY by comparing the printed value with the printed reference range; use "Unclear" when no range is printed or you cannot tell. Explain in plain words what the test measures.
4. Other health documents: explain the key terms in plain language.
5. Finish with a short overall summary and a few key points.

STRICT SAFETY RULES
- Never diagnose. Never confirm or rule out any disease or condition.
- Never recommend starting, stopping, changing or replacing any medicine or dose.
- Never invent, guess or "correct" medicine names, doses, values, units or ranges. If something is not clearly legible, leave that field empty and say it is unclear in the explanation.
- Use cautious wording such as "is often used for", "may be related to", "is outside the printed range". Never write "you have...", "this confirms..." or "you should take...".
- If the image is blurry, cut off, unreadable, or is NOT a medical/healthcare document: set readable=false, set documentType to "Unreadable or non-medical document", leave analysis and keyFindings empty, and explain briefly in patientSummary (en and ur) what is wrong and how to retake the photo.

URGENCY (how soon a doctor should look at it; never a diagnosis)
- Low: routine prescription, or all values inside their ranges.
- Medium: some values slightly outside the range, or something that deserves a doctor's attention.
- High: clearly abnormal values far outside the range, or serious-looking findings; say to speak to a doctor soon.

STYLE AND LENGTH (keep it short so it is fast to read)
- Everyday words for non-medical readers. Calm, non-alarming tone.
- Urdu must be natural, correct Urdu (not transliteration). Keep drug names, units and numbers in Latin script.
- patientSummary: 2-3 short sentences per language.
- Each simpleExplanation: ONE short sentence, max 25 words. Each purpose: max 12 words.
- At most 15 entries in analysis (merge trivial or duplicate lines). 3-5 keyFindings, each max 25 words.
- Return ONLY JSON that matches the schema.`;

const bilingualSchema: Schema = {
  type: Type.OBJECT,
  properties: { en: { type: Type.STRING }, ur: { type: Type.STRING } },
  required: ['en', 'ur'],
};

const explanationSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    simpleExplanation: { type: Type.STRING },
    purpose: { type: Type.STRING },
  },
  required: ['simpleExplanation'],
};

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    readable: { type: Type.BOOLEAN },
    documentType: { type: Type.STRING },
    patientSummary: bilingualSchema,
    analysis: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          medicineName: { type: Type.STRING },
          dosage: { type: Type.STRING },
          timing: { type: Type.STRING },
          value: { type: Type.STRING },
          referenceRange: { type: Type.STRING },
          status: { type: Type.STRING, enum: ['Low', 'Normal', 'High', 'Unclear'] },
          en: explanationSchema,
          ur: explanationSchema,
        },
        required: ['term', 'en', 'ur'],
      },
    },
    keyFindings: { type: Type.ARRAY, items: bilingualSchema },
    urgencyLevel: { type: Type.STRING, enum: ['Low', 'Medium', 'High'] },
  },
  required: ['readable', 'documentType', 'patientSummary', 'analysis', 'keyFindings', 'urgencyLevel'],
};

/* ------------------------------------------------------------------ */
/* Gemini client                                                       */
/* ------------------------------------------------------------------ */

const PLACEHOLDER_KEYS = new Set(['', 'MY_GEMINI_API_KEY', 'YOUR_GEMINI_API_KEY', 'your_api_key_here']);

let cachedClient: { key: string; client: GoogleGenAI } | null = null;

function readApiKey(): string {
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
}

export function isApiKeyConfigured(): boolean {
  return !PLACEHOLDER_KEYS.has(readApiKey());
}

function getClient(): GoogleGenAI {
  const key = readApiKey();
  if (PLACEHOLDER_KEYS.has(key)) throw new AnalyzeError('NO_KEY');
  if (!cachedClient || cachedClient.key !== key) {
    cachedClient = { key, client: new GoogleGenAI({ apiKey: key }) };
  }
  return cachedClient.client;
}

export function getConfiguredModels(): string[] {
  const primary = (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  const fallback = (process.env.GEMINI_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL).trim();
  return [...new Set([primary, fallback].filter(Boolean))];
}

/* ------------------------------------------------------------------ */
/* Error classification                                                */
/* ------------------------------------------------------------------ */

interface Classified {
  code: ErrorCode;
  retryable: boolean;
  /** Retry the same model without the thinking config. */
  dropThinking: boolean;
  /** Skip to the next model. */
  nextModel: boolean;
}

function classify(err: unknown): Classified {
  const e = err as { name?: string; status?: number; message?: string };
  const msg = String(e?.message ?? err ?? '');
  const status = typeof e?.status === 'number' ? e.status : 0;
  const lower = msg.toLowerCase();

  const base = { retryable: false, dropThinking: false, nextModel: false };

  if (err instanceof AnalyzeError) return { ...base, code: err.code };

  if (e?.name === 'AbortError' || e?.name === 'TimeoutError' || lower.includes('aborted')) {
    return { ...base, code: 'TIMEOUT', nextModel: true };
  }
  if (lower.includes('api key not valid') || lower.includes('api_key_invalid') || lower.includes('consumer_suspended')) {
    return { ...base, code: 'BAD_KEY' };
  }
  if (lower.includes('location is not supported')) {
    return { ...base, code: 'REGION' };
  }
  if (status === 400) {
    if (lower.includes('thinking')) return { ...base, code: 'BAD_MODEL', dropThinking: true };
    if (lower.includes('image') || lower.includes('pdf') || lower.includes('document')) {
      return { ...base, code: 'UNREADABLE' };
    }
    return { ...base, code: 'UNKNOWN' };
  }
  if (status === 401 || status === 403) return { ...base, code: 'BAD_KEY' };
  if (status === 404) return { ...base, code: 'BAD_MODEL', nextModel: true };
  if (status === 429) return { code: 'QUOTA', retryable: true, dropThinking: false, nextModel: true };
  if (status >= 500) return { code: 'OVERLOADED', retryable: true, dropThinking: false, nextModel: true };

  // Network-level failures (fetch failed, ECONNRESET, ...)
  return { code: 'UNKNOWN', retryable: true, dropThinking: false, nextModel: true };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Response normalisation                                              */
/* ------------------------------------------------------------------ */

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function optStr(v: unknown): string | undefined {
  const s = str(v);
  return s ? s : undefined;
}

function bilingual(v: unknown): Bilingual {
  const o = (v ?? {}) as Record<string, unknown>;
  const en = str(o.en);
  const ur = str(o.ur);
  return { en: en || ur, ur: ur || en };
}

function block(v: unknown) {
  const o = (v ?? {}) as Record<string, unknown>;
  return { simpleExplanation: str(o.simpleExplanation), purpose: optStr(o.purpose) };
}

function parseJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('not json');
  }
}

function normalize(raw: unknown): AnalysisResponse {
  if (!raw || typeof raw !== 'object') throw new AnalyzeError('BAD_RESPONSE');
  const o = raw as Record<string, unknown>;

  if (o.readable === false) throw new AnalyzeError('UNREADABLE');

  const analysis: AnalysisItem[] = (Array.isArray(o.analysis) ? o.analysis : [])
    .map((it): AnalysisItem | null => {
      const x = (it ?? {}) as Record<string, unknown>;
      const term = str(x.term) || str(x.medicineName);
      if (!term) return null;
      const status = str(x.status) as ResultStatus;
      return {
        term,
        en: block(x.en),
        ur: block(x.ur),
        medicineName: optStr(x.medicineName),
        dosage: optStr(x.dosage),
        timing: optStr(x.timing),
        value: optStr(x.value),
        referenceRange: optStr(x.referenceRange),
        status: ['Low', 'Normal', 'High', 'Unclear'].includes(status) ? status : undefined,
      };
    })
    .filter((x): x is AnalysisItem => x !== null);

  const keyFindings = (Array.isArray(o.keyFindings) ? o.keyFindings : [])
    .map(bilingual)
    .filter((k) => k.en || k.ur);

  const summary = bilingual(o.patientSummary);
  if (!summary.en && analysis.length === 0) throw new AnalyzeError('BAD_RESPONSE');

  const urgency = str(o.urgencyLevel) as UrgencyLevel;

  return {
    documentType: str(o.documentType) || 'Medical document',
    patientSummary: summary,
    analysis,
    keyFindings,
    urgencyLevel: ['Low', 'Medium', 'High'].includes(urgency) ? urgency : 'Medium',
    // Always our own fixed, reviewed disclaimer, never model-generated text.
    disclaimer: DISCLAIMER,
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface AnalyzeInput {
  base64Image?: unknown;
  mimeType?: unknown;
}

export function validateInput(input: AnalyzeInput): { data: string; mimeType: string } {
  let data = typeof input.base64Image === 'string' ? input.base64Image : '';
  data = data.replace(/^data:[^;]+;base64,/, '');
  if (data.length < 100) throw new AnalyzeError('NO_IMAGE');
  if (data.length > MAX_BASE64_CHARS) throw new AnalyzeError('TOO_LARGE');

  let mimeType = typeof input.mimeType === 'string' ? input.mimeType.toLowerCase() : 'image/jpeg';
  if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
  if (!ALLOWED_MIME.has(mimeType)) throw new AnalyzeError('BAD_TYPE');

  return { data, mimeType };
}

export async function analyzeDocument(input: AnalyzeInput): Promise<AnalysisResponse> {
  const { data, mimeType } = validateInput(input);
  const ai = getClient();

  const started = Date.now();
  const deadline = started + TOTAL_BUDGET_MS;
  let lastCode: ErrorCode = 'UNKNOWN';

  for (const model of getConfiguredModels()) {
    let useThinking = true;

    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 3_000) throw new AnalyzeError('TIMEOUT');

      try {
        const result = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { data, mimeType } },
                { text: 'Analyze this medical document and respond in the required JSON format, in English and Urdu.' },
              ],
            },
          ],
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            // Low thinking = much faster, plenty for reading and explaining a document.
            ...(useThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            abortSignal: AbortSignal.timeout(Math.min(remaining, ATTEMPT_CAP_MS)),
          },
        });

        const text = result.text;
        if (!text) throw new AnalyzeError('BAD_RESPONSE');

        let parsed: unknown;
        try {
          parsed = parseJson(text);
        } catch {
          throw new AnalyzeError('BAD_RESPONSE');
        }

        const normalized = normalize(parsed);
        normalized.meta = { model, durationMs: Date.now() - started };
        return normalized;
      } catch (err) {
        const c = classify(err);
        lastCode = c.code;
        console.warn(
          `[analyze] model=${model} attempt=${attempt + 1} code=${c.code} ` +
            `msg=${String((err as Error)?.message ?? err).slice(0, 200)}`,
        );

        if (c.code === 'UNREADABLE' && err instanceof AnalyzeError) throw err;
        if (c.code === 'NO_KEY' || c.code === 'BAD_KEY' || c.code === 'REGION') throw new AnalyzeError(c.code);

        if (c.dropThinking && useThinking) {
          useThinking = false;
          attempt--; // not a real failure, redo immediately without thinking config
          continue;
        }
        if (c.nextModel && !c.retryable) break;
        if (c.retryable && attempt < MAX_ATTEMPTS_PER_MODEL - 1) {
          await sleep(700 * (attempt + 1));
          continue;
        }
        if (c.code === 'BAD_RESPONSE') continue;
        break;
      }
    }
  }

  throw new AnalyzeError(lastCode === 'BAD_MODEL' ? 'BAD_MODEL' : lastCode);
}
