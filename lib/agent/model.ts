import { createGoogle } from '@ai-sdk/google';
import { APICallError, wrapLanguageModel } from 'ai';

type WrappableModel = Extract<Parameters<typeof wrapLanguageModel>[0]['model'], { specificationVersion: 'v4' }>;

export function isRateLimit(e: unknown): boolean {
  return APICallError.isInstance(e) && e.statusCode === 429;
}

/** 429, 5xx o cualquier falla reintentable (red, sobrecarga): vale la pena probar con el modelo de respaldo. */
export function shouldFallback(e: unknown): boolean {
  return APICallError.isInstance(e) && (e.statusCode === 429 || e.isRetryable);
}

/** Si el modelo principal falla con 429/5xx/red, reintenta con el de respaldo. */
export function withFallback(primary: WrappableModel, fallback: WrappableModel) {
  return wrapLanguageModel({
    model: primary,
    middleware: {
      specificationVersion: 'v4',
      wrapGenerate: async ({ doGenerate, params }) => {
        try {
          return await doGenerate();
        } catch (e) {
          if (shouldFallback(e)) return fallback.doGenerate(params);
          throw e;
        }
      },
      wrapStream: async ({ doStream, params }) => {
        try {
          return await doStream();
        } catch (e) {
          if (shouldFallback(e)) return fallback.doStream(params);
          throw e;
        }
      },
    },
  });
}

export function getModel(env: Record<string, string | undefined> = process.env) {
  if (!env.GEMINI_API_KEY) throw new Error('Falta GEMINI_API_KEY en .env.local');
  const google = createGoogle({ apiKey: env.GEMINI_API_KEY });
  const primary = google(env.GEMINI_MODEL || 'gemini-flash-latest');
  return env.GEMINI_FALLBACK_MODEL ? withFallback(primary, google(env.GEMINI_FALLBACK_MODEL)) : primary;
}
