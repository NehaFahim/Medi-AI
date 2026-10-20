/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload,
  FileText,
  Activity,
  CheckCircle,
  AlertCircle,
  Loader2,
  ShieldCheck,
  ArrowRight,
  Info,
  Stethoscope,
  X,
  Printer,
  RotateCw,
} from 'lucide-react';
import type { ErrorCode, Lang, ResultStatus } from '../shared/types';
import { analyzeMedicalDocument, AnalysisError, type AnalysisResponse } from './services/gemini';
import { MAX_PICK_BYTES_IMAGE, MAX_UPLOAD_BYTES, PrepError, prepareFile } from './services/imagePrep';
import { RETRYABLE, SETUP_ERRORS, getErrorMessage } from './services/messages';
import { getSampleAnalysis } from './services/sample';

type Phase = 'idle' | 'preparing' | 'analyzing';

const URGENCY_LABEL: Record<string, Record<Lang, string>> = {
  Low: { en: 'Low', ur: 'کم' },
  Medium: { en: 'Medium', ur: 'درمیانی' },
  High: { en: 'High', ur: 'زیادہ' },
};

const STATUS_LABEL: Record<ResultStatus, Record<Lang, string>> = {
  Low: { en: 'Low', ur: 'کم' },
  Normal: { en: 'Normal', ur: 'نارمل' },
  High: { en: 'High', ur: 'زیادہ' },
  Unclear: { en: 'Unclear', ur: 'واضح نہیں' },
};

const getUrgencyStyles = (level: string) => {
  switch (level) {
    case 'High': return 'bg-red-100 text-red-700 border-red-200';
    case 'Medium': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'Low': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    default: return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

const getStatusStyles = (status: ResultStatus) => {
  switch (status) {
    case 'High': return 'bg-red-100 text-red-700 border-red-200';
    case 'Low': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'Normal': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    default: return 'bg-slate-100 text-slate-600 border-slate-200';
  }
};

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<{ code: ErrorCode } | null>(null);
  const [lang, setLang] = useState<Lang>('en');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isBusy = phase !== 'idle';
  const isPdf = file?.type === 'application/pdf';

  // Keep <html lang> in sync (screen readers, fonts, hyphenation).
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Free the preview object URL when it changes or on unmount.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Elapsed-seconds counter while working.
  useEffect(() => {
    if (!isBusy) return;
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(id);
  }, [isBusy]);

  const handleLoadSample = () => {
    setError(null);
    setResult(getSampleAnalysis());
  };

  const selectFile = (f: File) => {
    const image = f.type.startsWith('image/');
    const pdf = f.type === 'application/pdf';
    if (!image && !pdf) {
      setResult(null);
      setError({ code: 'BAD_TYPE' });
      return;
    }
    if ((pdf && f.size > MAX_UPLOAD_BYTES) || (image && f.size > MAX_PICK_BYTES_IMAGE)) {
      setResult(null);
      setError({ code: 'TOO_LARGE' });
      return;
    }
    setFile(f);
    setPreviewUrl(image ? URL.createObjectURL(f) : null);
    setResult(null);
    setError(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) selectFile(f);
    e.target.value = ''; // allow choosing the same file again
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isBusy) return;
    const f = e.dataTransfer.files?.[0];
    if (f) selectFile(f);
  };

  const handleUploadClick = () => {
    if (!isBusy) fileInputRef.current?.click();
  };

  const clearAll = () => {
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
  };

  const onCancel = () => abortRef.current?.abort();

  const onAnalyze = async () => {
    if (!file || isBusy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setResult(null);
    setError(null);
    setPhase('preparing');

    try {
      const prepared = await prepareFile(file);
      if (controller.signal.aborted) throw new AnalysisError('CANCELLED');
      setPhase('analyzing');
      const data = await analyzeMedicalDocument(prepared, controller.signal);
      setResult(data);
    } catch (err) {
      const code: ErrorCode =
        err instanceof AnalysisError || err instanceof PrepError ? err.code : 'UNKNOWN';
      if (code !== 'CANCELLED') {
        if (!(err instanceof AnalysisError || err instanceof PrepError)) console.error(err);
        setError({ code });
      }
    } finally {
      abortRef.current = null;
      setPhase('idle');
    }
  };

  const t = (en: string, ur: string) => (lang === 'en' ? en : ur);

  return (
    <div
      className={`min-h-screen flex flex-col transition-all ${lang === 'ur' ? 'font-urdu' : 'font-sans'}`}
      dir={lang === 'ur' ? 'rtl' : 'ltr'}
    >
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 print:static">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shrink-0">
              <Stethoscope size={24} />
            </div>
            <div className="hidden sm:block">
              <h1 className="font-display font-bold text-xl tracking-tight text-slate-900" dir="ltr">
                MediInterpret<span className="text-blue-600">AI</span>
              </h1>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-500">
                {t('Secure Medical Assistance', 'محفوظ طبی مدد')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 print:hidden">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200" dir="ltr">
              <button
                onClick={() => setLang('en')}
                aria-pressed={lang === 'en'}
                className={`px-3 sm:px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${lang === 'en' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700 font-sans'}`}
              >
                English
              </button>
              <button
                onClick={() => setLang('ur')}
                aria-pressed={lang === 'ur'}
                className={`px-3 sm:px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${lang === 'ur' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700 font-urdu'}`}
              >
                اردو
              </button>
            </div>
            <div className="hidden md:flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
              <ShieldCheck size={16} />
              <span className="text-xs font-medium">{t('Safe', 'محفوظ')}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Left Column: Upload & Instructions */}
          <div className="lg:col-span-5 space-y-8 print:hidden">
            <section className="space-y-4">
              <h2 className="font-display text-4xl font-bold text-slate-900 leading-[1.1]">
                {lang === 'en' ? (
                  <>Understand your <span className="text-blue-600">Medical Documents</span> with ease.</>
                ) : (
                  <>اپنی <span className="text-blue-600">طبی دستاویزات</span> کو آسانی سے سمجھیں۔</>
                )}
              </h2>
              <p className="text-slate-600 text-lg leading-relaxed">
                {t(
                  'Upload a photo or PDF of your prescription or lab report. Our AI translates complex jargon into simple, everyday language.',
                  'اپنے نسخے یا لیب رپورٹ کی تصویر یا PDF اپ لوڈ کریں۔ ہماری AI پیچیدہ طبی الفاظ کو روزمرہ کی سادہ زبان میں ترجمہ کرتی ہے۔',
                )}
              </p>
            </section>

            <section className="space-y-4">
              <div
                role="button"
                tabIndex={0}
                aria-label={t('Upload medical document', 'طبی دستاویز اپ لوڈ کریں')}
                onClick={handleUploadClick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleUploadClick();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!isBusy) setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`relative group border-2 border-dashed rounded-3xl p-8 transition-all h-64 flex flex-col items-center justify-center text-center overflow-hidden
                  ${isBusy ? 'cursor-not-allowed' : 'cursor-pointer'}
                  ${isDragging ? 'border-blue-500 bg-blue-50' : file ? 'border-blue-400 bg-blue-50/30' : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50'}`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*,application/pdf"
                  className="hidden"
                />

                {file ? (
                  <div className="absolute inset-0 w-full h-full">
                    {previewUrl && (
                      <img src={previewUrl} alt="" className="w-full h-full object-cover opacity-20" />
                    )}
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                      <div className="bg-white/90 backdrop-blur p-4 rounded-2xl shadow-sm border border-slate-200">
                        <FileText size={40} className="text-blue-600 mb-2 mx-auto" />
                        <p className="text-sm font-semibold text-slate-800 truncate max-w-50" dir="auto">
                          {file.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {isPdf ? 'PDF · ' : ''}
                          {(file.size / 1024 / 1024).toFixed(1)} MB ·{' '}
                          {t('Click to change file', 'فائل تبدیل کرنے کے لیے کلک کریں')}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform">
                      <Upload size={32} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">
                        {t('Upload medical document', 'طبی دستاویز اپ لوڈ کریں')}
                      </p>
                      <p className="text-sm text-slate-500">
                        {t('Drag & drop or click · Image or PDF', 'ڈریگ اینڈ ڈراپ یا کلک کریں · تصویر یا PDF')}
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-4">
                <button
                  disabled={!file || isBusy}
                  onClick={onAnalyze}
                  className="flex-1 h-14 bg-blue-600 text-white rounded-2xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                >
                  {isBusy ? (
                    <>
                      <Loader2 className="animate-spin" />
                      {phase === 'preparing'
                        ? t('Preparing image...', 'تصویر تیار کی جا رہی ہے...')
                        : t('Analyzing Document...', 'تجزیہ کیا جا رہا ہے...')}
                    </>
                  ) : (
                    <>
                      {t('Interpret Document', 'دستاویز کی تشریح کریں')}
                      <ArrowRight size={20} className={lang === 'ur' ? 'rotate-180' : ''} />
                    </>
                  )}
                </button>

                {file && !isBusy && (
                  <button
                    onClick={clearAll}
                    className="w-14 h-14 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center hover:bg-slate-200 transition-all border border-slate-200"
                    title={t('Clear', 'صاف کریں')}
                    aria-label={t('Clear', 'صاف کریں')}
                  >
                    <X size={20} />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 px-1">
                <span className="text-xs text-slate-500 font-medium">
                  {t('Want to test the interpreter right now?', 'کیا آپ ابھی ٹیسٹ کرنا چاہتے ہیں؟')}
                </span>
                <button
                  type="button"
                  onClick={handleLoadSample}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors border border-blue-200 shadow-xs disabled:opacity-50"
                >
                  <FileText size={14} />
                  {t('Try Sample Report', 'نمونہ رپورٹ دیکھیں')}
                </button>
              </div>

              <div className="p-4 bg-slate-100 rounded-2xl border border-slate-200 flex gap-3">
                <Info size={18} className="text-slate-500 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-500 italic leading-relaxed">
                  {t(
                    'Your privacy matters. Your file is sent only for this analysis and is not stored by this app.',
                    'آپ کی رازداری اہم ہے۔ آپ کی فائل صرف اسی تجزیے کے لیے بھیجی جاتی ہے اور یہ ایپ اسے محفوظ نہیں کرتی۔',
                  )}
                </p>
              </div>
            </section>
          </div>

          {/* Right Column: Analysis Result */}
          <div className="lg:col-span-7 print:col-span-12">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  key="error"
                  role="alert"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-red-50 border border-red-200 p-6 rounded-3xl flex gap-4"
                >
                  <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={24} />
                  <div className="flex-1">
                    <h3 className="font-bold text-red-900 mb-1">{t('Analysis Error', 'تجزیے میں غلطی')}</h3>
                    <p className="text-red-700 text-sm leading-relaxed">{getErrorMessage(error.code, lang)}</p>

                    {SETUP_ERRORS.has(error.code) && (
                      <div className="mt-3 bg-white/80 p-3.5 rounded-xl border border-red-200 text-xs text-slate-700 space-y-1.5">
                        <p className="font-bold text-slate-900">{t('How to fix this:', 'اس مسئلے کا حل:')}</p>
                        <a
                          href="https://aistudio.google.com/apikey"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold underline"
                          dir="ltr"
                        >
                          Google AI Studio API Keys →
                        </a>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-3">
                      {file && RETRYABLE.has(error.code) && (
                        <button
                          type="button"
                          onClick={onAnalyze}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-colors"
                        >
                          <RotateCw size={13} />
                          {t('Try again', 'دوبارہ کوشش کریں')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleLoadSample}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold shadow-xs transition-colors"
                      >
                        <FileText size={13} />
                        {t('Preview Sample Report', 'نمونہ رپورٹ دیکھیں')}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {!isBusy && !result && !error && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full min-h-100 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-center p-8 bg-slate-50/50"
                >
                  <Activity size={48} className="text-slate-300 mb-4" />
                  <p className="text-slate-400 font-medium mb-3">
                    {t('Upload a document to see the analysis appear here.', 'یہاں تجزیہ دیکھنے کے لیے دستاویز اپ لوڈ کریں۔')}
                  </p>
                  <button
                    type="button"
                    onClick={handleLoadSample}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-xs transition-all hover:border-slate-300"
                  >
                    <FileText size={14} className="text-blue-600" />
                    {t('Or preview sample report output', 'یا نمونہ رپورٹ کا رزلٹ دیکھیں')}
                  </button>
                </motion.div>
              )}

              {isBusy && (
                <motion.div
                  key="loading"
                  aria-live="polite"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full min-h-100 flex flex-col items-center justify-center p-8 space-y-6"
                >
                  <div className="relative">
                    <div className="w-20 h-20 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                    <Activity className="absolute inset-0 m-auto text-blue-600 animate-pulse" size={32} />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="font-display font-bold text-xl">
                      {phase === 'preparing'
                        ? t('Preparing your document...', 'آپ کی دستاویز تیار کی جا رہی ہے...')
                        : t('AI is processing...', 'AI پروسیسنگ کر رہا ہے...')}
                    </h3>
                    <p className="text-slate-500 text-sm animate-pulse">
                      {t(
                        'Reading medical terms and translating for you.',
                        'طبی اصطلاحات کو پڑھا جا رہا ہے اور آپ کے لیے ترجمہ کیا جا رہا ہے۔',
                      )}
                    </p>
                    <p className="text-slate-400 text-xs tabular-nums" dir="ltr">
                      {elapsed}s
                    </p>
                    {elapsed >= 20 && (
                      <p className="text-slate-400 text-xs">
                        {t(
                          'Detailed documents can take up to a minute. Almost there...',
                          'تفصیلی دستاویزات میں ایک منٹ تک لگ سکتا ہے۔ بس تھوڑا انتظار...',
                        )}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold transition-colors"
                  >
                    {t('Cancel', 'منسوخ کریں')}
                  </button>
                </motion.div>
              )}

              {result && !isBusy && !error && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  {result.isSample && (
                    <div className="bg-blue-50/80 border border-blue-200/80 px-4 py-3 rounded-2xl flex items-center gap-3 text-xs text-blue-900 shadow-xs">
                      <Info size={18} className="text-blue-600 shrink-0" />
                      <span className="font-medium leading-relaxed">
                        {t(
                          'Sample report: this is demo data to show how results look. It is not from your document.',
                          'نمونہ رپورٹ: یہ صرف ڈیمو ڈیٹا ہے جو نتیجے کی شکل دکھاتا ہے۔ یہ آپ کی دستاویز سے نہیں ہے۔',
                        )}
                      </span>
                    </div>
                  )}

                  {/* Status Card */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="text-emerald-500 shrink-0" size={20} />
                          <h3 className="font-display font-bold text-lg text-slate-900">
                            {t('Analysis Complete', 'تجزیہ مکمل ہو گیا')}
                          </h3>
                        </div>
                        <p className="text-sm text-slate-500 font-medium" dir="auto">{result.documentType}</p>
                        {result.meta && (
                          <p className="text-[11px] text-slate-400" dir="ltr">
                            {(result.meta.durationMs / 1000).toFixed(1)}s
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className={`px-4 py-1.5 rounded-full text-xs font-bold border ${getUrgencyStyles(result.urgencyLevel)}`}>
                          {t('Urgency', 'فوری ضرورت')}: {URGENCY_LABEL[result.urgencyLevel]?.[lang] ?? result.urgencyLevel}
                        </div>
                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="print:hidden inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                        >
                          <Printer size={12} />
                          {t('Print / Save PDF', 'پرنٹ / PDF محفوظ کریں')}
                        </button>
                      </div>
                    </div>

                    <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                      <h4 className="text-xs uppercase tracking-widest font-bold text-blue-800 mb-2">
                        {t('Patient Summary', 'مریض کا خلاصہ')}
                      </h4>
                      <p className="text-slate-800 leading-relaxed font-medium">
                        {result.patientSummary[lang] || result.patientSummary.en}
                      </p>
                    </div>
                  </div>

                  {/* Findings Grid */}
                  {result.analysis.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {result.analysis.map((item, idx) => {
                        const content = item[lang] ?? item.en;
                        return (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(idx, 8) * 0.06 }}
                            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-200 transition-colors break-inside-avoid"
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="font-bold text-slate-900" dir="auto">{item.term || item.medicineName}</h4>
                              {item.status && (
                                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusStyles(item.status)}`}>
                                  {STATUS_LABEL[item.status][lang]}
                                </span>
                              )}
                            </div>
                            <p className={`text-sm text-slate-600 mb-3 ${lang === 'ur' ? 'leading-loose' : ''}`}>
                              {content.simpleExplanation || content.purpose || '...'}
                            </p>

                            {(item.dosage || item.timing || item.value || item.referenceRange) && (
                              <div className="flex gap-2 flex-wrap" dir="ltr">
                                {item.value && (
                                  <span className="px-2 py-1 bg-blue-50 rounded text-[10px] font-bold text-blue-700">
                                    {item.value}
                                  </span>
                                )}
                                {item.referenceRange && (
                                  <span className="px-2 py-1 bg-slate-100 rounded text-[10px] font-bold text-slate-600">
                                    <bdi>{t('Range', 'رینج')}</bdi>: <bdi>{item.referenceRange}</bdi>
                                  </span>
                                )}
                                {item.dosage && (
                                  <span className="px-2 py-1 bg-slate-100 rounded text-[10px] font-bold text-slate-600">
                                    {item.dosage}
                                  </span>
                                )}
                                {item.timing && (
                                  <span className="px-2 py-1 bg-slate-100 rounded text-[10px] font-bold text-slate-600">
                                    {item.timing}
                                  </span>
                                )}
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  )}

                  {/* Key Highlights */}
                  {result.keyFindings.length > 0 && (
                    <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl shadow-slate-200 print:bg-white print:text-slate-900 print:border print:border-slate-300 print:shadow-none">
                      <h4 className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-4">
                        {t('Key Highlights', 'اہم نکات')}
                      </h4>
                      <ul className="space-y-3">
                        {result.keyFindings.map((finding, idx) => (
                          <li key={idx} className="flex gap-3 text-sm leading-relaxed text-slate-200 print:text-slate-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />
                            {finding[lang] || finding.en}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Disclaimer Card */}
                  <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 flex gap-4">
                    <AlertCircle className="text-amber-600 shrink-0" size={24} />
                    <p className="text-xs text-amber-800 leading-relaxed italic">
                      {result.disclaimer[lang] || result.disclaimer.en}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Persistent Footer Disclaimer */}
      <footer className="mt-auto py-12 px-4 border-t border-slate-200 bg-white text-center sm:text-start">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between gap-8">
          <div className="max-w-md space-y-4">
            <div className="flex items-center gap-2 opacity-50 grayscale justify-center sm:justify-start" dir="ltr">
              <Stethoscope size={20} />
              <span className="font-display font-bold text-lg tracking-tight">MediInterpretAI</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed uppercase tracking-tighter" dir="ltr">
              AI-driven medical document simplification service. This application uses Google Gemini to interpret medical documents.
            </p>
          </div>
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 max-w-sm mx-auto sm:mx-0">
            <h4 className="text-xs uppercase font-bold text-slate-900 mb-2">{t('Notice & Safety', 'اطلاع اور حفاظت')}</h4>
            <p className="text-[10px] uppercase font-bold text-slate-400 leading-relaxed mb-1">
              {t('THIS IS NOT MEDICAL ADVICE.', 'یہ طبی مشورہ نہیں ہے۔')}
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              {t(
                'Our AI interpretations are for informational purposes to help you understand medical language. Always verify results with a medical professional.',
                'ہماری AI تشریحات صرف معلومات کے لیے ہیں تاکہ آپ طبی زبان سمجھ سکیں۔ نتائج کی تصدیق ہمیشہ کسی طبی ماہر سے کروائیں۔',
              )}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
