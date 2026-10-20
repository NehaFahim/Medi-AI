import type { AnalysisResponse } from '../../shared/types';

/** Built-in demo output so people can preview the interface. Always flagged `isSample`. */
export function getSampleAnalysis(): AnalysisResponse {
  return {
    isSample: true,
    documentType: 'Sample: Prescription and Lab Result',
    patientSummary: {
      en: 'This sample shows a short 5-day prescription for common cold-type symptoms, plus one lab value compared with its printed range. It is demo data, not from your document.',
      ur: 'یہ نمونہ عام نزلہ زکام کی علامات کے لیے 5 دن کا مختصر نسخہ اور ایک لیب ویلیو اس کی پرنٹ شدہ رینج کے ساتھ دکھاتا ہے۔ یہ ڈیمو ڈیٹا ہے، آپ کی دستاویز سے نہیں۔',
    },
    analysis: [
      {
        term: 'Paracetamol 500 mg',
        medicineName: 'Paracetamol',
        dosage: '1 tablet (500 mg)',
        timing: 'Twice daily after meals',
        en: {
          simpleExplanation: 'A common medicine that is often used to ease pain and bring down fever.',
          purpose: 'Fever and body aches',
        },
        ur: {
          simpleExplanation: 'ایک عام دوا جو عموماً درد کم کرنے اور بخار اتارنے کے لیے استعمال ہوتی ہے۔',
          purpose: 'بخار اور جسم درد',
        },
      },
      {
        term: 'Cetirizine 10 mg',
        medicineName: 'Cetirizine',
        dosage: '1 tablet (10 mg)',
        timing: 'Once daily at bedtime',
        en: {
          simpleExplanation: 'An anti-allergy medicine often used for sneezing, runny nose and itching.',
          purpose: 'Allergy symptoms',
        },
        ur: {
          simpleExplanation: 'الرجی کی ایک دوا جو عموماً چھینکوں، ناک بہنے اور خارش میں استعمال ہوتی ہے۔',
          purpose: 'الرجی کی علامات',
        },
      },
      {
        term: 'Hemoglobin',
        value: '13.2 g/dL',
        referenceRange: '12.0 - 15.5 g/dL',
        status: 'Normal',
        en: {
          simpleExplanation: 'Measures the protein in red blood cells that carries oxygen. This value is inside the printed range.',
          purpose: 'Oxygen-carrying protein',
        },
        ur: {
          simpleExplanation: 'خون کے سرخ خلیوں میں آکسیجن لے جانے والی پروٹین کو ناپتا ہے۔ یہ ویلیو پرنٹ شدہ رینج کے اندر ہے۔',
          purpose: 'آکسیجن لے جانے والی پروٹین',
        },
      },
    ],
    keyFindings: [
      {
        en: 'The prescription is a routine short course meant for symptom relief.',
        ur: 'یہ نسخہ علامات میں آرام کے لیے ایک معمول کا مختصر کورس ہے۔',
      },
      {
        en: 'The sample lab value is inside its printed reference range.',
        ur: 'نمونے کی لیب ویلیو پرنٹ شدہ ریفرنس رینج کے اندر ہے۔',
      },
      {
        en: 'If symptoms continue or get worse, talk to your doctor.',
        ur: 'اگر علامات برقرار رہیں یا بڑھ جائیں تو اپنے ڈاکٹر سے بات کریں۔',
      },
    ],
    urgencyLevel: 'Low',
    disclaimer: {
      en: 'This is an automated educational summary, not a medical diagnosis or medical advice. Always consult a qualified doctor or pharmacist before starting, stopping or changing any medicine.',
      ur: 'یہ ایک خودکار تعلیمی خلاصہ ہے، طبی تشخیص یا طبی مشورہ نہیں۔ کوئی بھی دوا شروع کرنے، بند کرنے یا تبدیل کرنے سے پہلے اپنے مستند ڈاکٹر یا فارماسسٹ سے ضرور مشورہ کریں۔',
    },
  };
}
