import { APICallError, streamText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { getModel, isRateLimit, withFallback } from '@/lib/agent/model';
import { textStream } from './mock-model';

const apiError = (statusCode: number) =>
  new APICallError({ message: `HTTP ${statusCode}`, url: 'https://x', requestBodyValues: {}, statusCode, isRetryable: true });

async function textOf(model: Parameters<typeof streamText>[0]['model']) {
  const r = streamText({ model, prompt: 'hola', maxRetries: 0 });
  let out = '';
  for await (const p of r.stream) {
    if (p.type === 'text-delta') out += p.text;
    if (p.type === 'error') throw p.error;
  }
  return out;
}

describe('withFallback', () => {
  it('usa el modelo de respaldo ante un 429', async () => {
    const primary = new MockLanguageModelV4({ doStream: async () => { throw apiError(429); } });
    const fallback = new MockLanguageModelV4({ doStream: async () => textStream('desde respaldo') });
    expect(await textOf(withFallback(primary, fallback))).toBe('desde respaldo');
  });

  it('no usa el respaldo ante otros errores', async () => {
    const primary = new MockLanguageModelV4({ doStream: async () => { throw apiError(500); } });
    const fallback = new MockLanguageModelV4({ doStream: async () => textStream('no') });
    await expect(textOf(withFallback(primary, fallback))).rejects.toThrow('HTTP 500');
  });
});

describe('isRateLimit / getModel', () => {
  it('detecta 429', () => {
    expect(isRateLimit(apiError(429))).toBe(true);
    expect(isRateLimit(apiError(400))).toBe(false);
    expect(isRateLimit(new Error('x'))).toBe(false);
  });
  it('exige GEMINI_API_KEY', () => {
    expect(() => getModel({})).toThrow('GEMINI_API_KEY');
    expect(getModel({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-flash-lite-latest' }).modelId).toBe('gemini-flash-lite-latest');
  });
});
