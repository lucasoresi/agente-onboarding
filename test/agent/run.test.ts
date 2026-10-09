import { APICallError, tool, type UIMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { friendlyError, streamAgentResponse } from '@/lib/agent/run';
import { scriptedModel, textStream, toolCallStream } from './mock-model';

const userMessage: UIMessage[] = [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: '¿cómo voy?' }] }];

describe('streamAgentResponse', () => {
  it('ejecuta la tool pedida y responde con texto', async () => {
    let called = 0;
    const tools = {
      ver_progreso: tool({ inputSchema: z.object({}), execute: async () => { called++; return { completos: 3 }; } }),
    };
    const model = scriptedModel(() => toolCallStream('ver_progreso', {}), () => textStream('Vas 3 de 14.'));
    const res = await streamAgentResponse(userMessage, { model, tools, instructions: 'x', docsAvailable: true, maxRetries: 0 });
    const body = await res.text();
    expect(called).toBe(1);
    expect(body).toContain('tool-output-available');
    expect(body).toContain('Vas 3 de 14.');
    expect(body).toContain('"docsAvailable":true');
  });

  it('convierte un 429 en un mensaje amigable', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new APICallError({ message: 'quota', url: 'u', requestBodyValues: {}, statusCode: 429, isRetryable: true });
      },
    });
    const res = await streamAgentResponse(userMessage, { model, tools: {}, instructions: 'x', docsAvailable: true, maxRetries: 0 });
    expect(await res.text()).toContain('límite gratuito de Gemini');
  });
});

describe('friendlyError', () => {
  it('mensajes por tipo de error', () => {
    expect(friendlyError(new Error('x'))).toContain('error inesperado');
    expect(friendlyError(new APICallError({ message: 'm', url: 'u', requestBodyValues: {}, statusCode: 503 }))).toContain('no está respondiendo');
  });
});
