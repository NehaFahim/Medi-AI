import type { ErrorCode, Lang } from '../../shared/types';

/** User-facing error text in both languages, chosen at render time so it follows the language toggle. */
const MESSAGES: Record<ErrorCode, Record<Lang, string>> = {
  NO_IMAGE: {
    en: 'Please choose an image or PDF of your medical document first.',
    ur: 'پہلے اپنی طبی دستاویز کی تصویر یا PDF منتخب کریں۔',
  },
  BAD_TYPE: {
    en: 'This file type is not supported. Please upload a JPG, PNG or WebP image, or a PDF.',
    ur: 'یہ فائل قسم سپورٹ نہیں کی جاتی۔ براہِ کرم JPG، PNG یا WebP تصویر، یا PDF اپ لوڈ کریں۔',
  },
  TOO_LARGE: {
    en: 'The file is too large. Please use a smaller image, or a PDF under 3 MB.',
    ur: 'فائل بہت بڑی ہے۔ براہِ کرم چھوٹی تصویر یا 3 MB سے کم کی PDF استعمال کریں۔',
  },
  UNSUPPORTED_IMAGE: {
    en: 'This image format could not be read by your browser. Please take a normal JPG/PNG photo or screenshot and try again.',
    ur: 'آپ کا براؤزر یہ تصویر نہیں پڑھ سکا۔ براہِ کرم عام JPG/PNG تصویر یا اسکرین شاٹ لے کر دوبارہ کوشش کریں۔',
  },
  NO_KEY: {
    en: 'The server has no Gemini API key. Add GEMINI_API_KEY in your hosting Environment Variables (or .env locally) and redeploy.',
    ur: 'سرور پر Gemini API کلید موجود نہیں۔ ہوسٹنگ کی Environment Variables (یا لوکل .env) میں GEMINI_API_KEY شامل کر کے دوبارہ ڈیپلائے کریں۔',
  },
  BAD_KEY: {
    en: 'The Gemini API key is invalid, suspended or blocked. Create a new key in Google AI Studio and update GEMINI_API_KEY.',
    ur: 'Gemini API کلید غلط، معطل یا بلاک ہے۔ Google AI Studio سے نئی کلید بنا کر GEMINI_API_KEY اپ ڈیٹ کریں۔',
  },
  REGION: {
    en: 'The Gemini API is not available from the region where the server runs. Choose a supported region for your hosting.',
    ur: 'جس علاقے میں سرور چل رہا ہے وہاں Gemini API دستیاب نہیں۔ ہوسٹنگ کے لیے کوئی سپورٹڈ ریجن منتخب کریں۔',
  },
  QUOTA: {
    en: 'The Gemini usage limit was reached. Please wait a minute and try again, or check your quota in Google AI Studio.',
    ur: 'Gemini کے استعمال کی حد پوری ہو گئی ہے۔ ایک منٹ بعد دوبارہ کوشش کریں یا Google AI Studio میں اپنا کوٹا چیک کریں۔',
  },
  OVERLOADED: {
    en: 'The AI service is very busy right now. Please try again in a few moments.',
    ur: 'اس وقت AI سروس پر بہت زیادہ بوجھ ہے۔ چند لمحوں بعد دوبارہ کوشش کریں۔',
  },
  TIMEOUT: {
    en: 'The analysis took too long. Please try again, or use a clearer, smaller photo.',
    ur: 'تجزیے میں بہت زیادہ وقت لگ گیا۔ براہِ کرم دوبارہ کوشش کریں یا زیادہ صاف اور چھوٹی تصویر استعمال کریں۔',
  },
  BAD_MODEL: {
    en: 'The configured AI model is not available. Check the GEMINI_MODEL setting.',
    ur: 'منتخب AI ماڈل دستیاب نہیں۔ GEMINI_MODEL کی سیٹنگ چیک کریں۔',
  },
  UNREADABLE: {
    en: 'The document could not be read clearly, or it does not look like a medical document. Please retake the photo in good light, flat and fully in frame.',
    ur: 'دستاویز واضح طور پر پڑھی نہیں جا سکی، یا یہ طبی دستاویز نہیں لگتی۔ براہِ کرم اچھی روشنی میں، سیدھی اور پوری فریم میں تصویر دوبارہ لیں۔',
  },
  BAD_RESPONSE: {
    en: 'The AI returned an incomplete answer. Please try again.',
    ur: 'AI نے نامکمل جواب دیا۔ براہِ کرم دوبارہ کوشش کریں۔',
  },
  NETWORK: {
    en: 'Could not reach the server. Please check your internet connection and try again.',
    ur: 'سرور سے رابطہ نہیں ہو سکا۔ اپنا انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔',
  },
  NO_BACKEND: {
    en: 'The analysis server was not found. Run the app with "npm run dev", or deploy it with the /api folder (for example on Vercel).',
    ur: 'تجزیے کا سرور نہیں ملا۔ ایپ کو "npm run dev" سے چلائیں، یا /api فولڈر کے ساتھ (مثلاً Vercel پر) ڈیپلائے کریں۔',
  },
  CANCELLED: {
    en: 'Analysis cancelled.',
    ur: 'تجزیہ منسوخ کر دیا گیا۔',
  },
  UNKNOWN: {
    en: 'An unexpected error occurred during analysis. Please try again.',
    ur: 'تجزیے کے دوران ایک غیر متوقع خرابی پیش آئی۔ براہِ کرم دوبارہ کوشش کریں۔',
  },
};

export function getErrorMessage(code: ErrorCode, lang: Lang): string {
  return (MESSAGES[code] ?? MESSAGES.UNKNOWN)[lang];
}

/** Errors where pressing "Try again" with the same file makes sense. */
export const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'TIMEOUT',
  'OVERLOADED',
  'QUOTA',
  'NETWORK',
  'BAD_RESPONSE',
  'UNKNOWN',
]);

/** Errors that are a server/key configuration problem, not the user's fault. */
export const SETUP_ERRORS: ReadonlySet<ErrorCode> = new Set<ErrorCode>(['NO_KEY', 'BAD_KEY', 'BAD_MODEL', 'REGION']);
