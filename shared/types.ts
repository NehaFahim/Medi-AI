/**
 * Types shared by the browser app and the server.
 * Only `import type` this file so nothing from it exists at runtime.
 */

export type Lang = 'en' | 'ur';

export type UrgencyLevel = 'Low' | 'Medium' | 'High';
export type ResultStatus = 'Low' | 'Normal' | 'High' | 'Unclear';

export interface Bilingual {
  en: string;
  ur: string;
}

export interface ExplanationBlock {
  simpleExplanation: string;
  purpose?: string;
}

export interface AnalysisItem {
  /** Medicine or test name as written in the document. */
  term: string;
  en: ExplanationBlock;
  ur: ExplanationBlock;
  medicineName?: string;
  dosage?: string;
  timing?: string;
  /** Lab reports: the measured value with its unit, e.g. "13.2 g/dL". */
  value?: string;
  /** Lab reports: the reference range printed on the report. */
  referenceRange?: string;
  /** Lab reports: derived only from the printed value vs. printed range. */
  status?: ResultStatus;
}

export interface AnalysisResponse {
  documentType: string;
  patientSummary: Bilingual;
  analysis: AnalysisItem[];
  keyFindings: Bilingual[];
  urgencyLevel: UrgencyLevel;
  disclaimer: Bilingual;
  /** True only for the built-in demo data, never for a real analysis. */
  isSample?: boolean;
  meta?: {
    model: string;
    durationMs: number;
  };
}

/** Error codes returned by the server or raised in the browser. */
export type ErrorCode =
  // server side
  | 'NO_IMAGE'
  | 'BAD_TYPE'
  | 'TOO_LARGE'
  | 'NO_KEY'
  | 'BAD_KEY'
  | 'REGION'
  | 'QUOTA'
  | 'OVERLOADED'
  | 'TIMEOUT'
  | 'BAD_MODEL'
  | 'UNREADABLE'
  | 'BAD_RESPONSE'
  | 'UNKNOWN'
  // browser side only
  | 'NETWORK'
  | 'NO_BACKEND'
  | 'CANCELLED'
  | 'UNSUPPORTED_IMAGE';

export interface ApiErrorBody {
  error: string;
  code: ErrorCode;
}
