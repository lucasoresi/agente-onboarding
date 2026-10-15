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

describe('streamAgentResponse: fallas de red y timeouts', () => {
  const failing = (e: unknown) => new MockLanguageModelV4({ doStream: async () => { throw e; } });
  it('un error de red (sin statusCode) da el mensaje de Gemini caído', async () => {
    const model = failing(new APICallError({ message: 'fetch failed', url: 'u', requestBodyValues: {} }));
    const res = await streamAgentResponse(userMessage, { model, tools: {}, instructions: 'x', docsAvailable: true, maxRetries: 0 });
    expect(await res.text()).toContain('no está respondiendo');
  });
  it('un TimeoutError da el mensaje de Gemini caído', async () => {
    const model = failing(new DOMException('timed out', 'TimeoutError'));
    const res = await streamAgentResponse(userMessage, { model, tools: {}, instructions: 'x', docsAvailable: true, maxRetries: 0 });
    expect(await res.text()).toContain('no está respondiendo');
  });
});

describe('streamAgentResponse: cierre del cliente MCP', () => {
  it('llama a onEnd exactamente una vez cuando Gemini falla con 429', async () => {
    let closed = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new APICallError({ message: 'quota', url: 'u', requestBodyValues: {}, statusCode: 429, isRetryable: true });
      },
    });
    const res = await streamAgentResponse(userMessage, {
      model, tools: {}, instructions: 'x', docsAvailable: true, maxRetries: 0, onEnd: () => { closed++; },
    });
    await res.text();
    expect(closed).toBe(1);
  });
  it('llama a onEnd una vez cuando el cliente cancela la respuesta', async () => {
    let closed = 0;
    const model = scriptedModel(() => textStream('hola'));
    const res = await streamAgentResponse(userMessage, {
      model, tools: {}, instructions: 'x', docsAvailable: true, maxRetries: 0, onEnd: () => { closed++; },
    });
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    await new Promise((r) => setTimeout(r, 20));
    expect(closed).toBe(1);
  });
});

describe('friendlyError', () => {
  it('mensajes por tipo de error', () => {
    expect(friendlyError(new Error('x'))).toContain('error inesperado');
    expect(friendlyError(new APICallError({ message: 'm', url: 'u', requestBodyValues: {}, statusCode: 503 }))).toContain('no está respondiendo');
  });
});

describe('streamAgentResponse: devuelve el progreso al navegador', () => {
  it('manda el progreso actualizado en la metadata al terminar cada paso', async () => {
    let completos = 0;
    const tools = {
      marcar_paso: tool({ inputSchema: z.object({}), execute: async () => { completos++; return { ok: true }; } }),
    };
    const model = scriptedModel(() => toolCallStream('marcar_paso', {}), () => textStream('Listo.'));
    const res = await streamAgentResponse(userMessage, {
      model, tools, instructions: 'x', docsAvailable: true, maxRetries: 0, progressSnapshot: () => ({ completos }),
    });
    const body = await res.text();
    expect(body).toContain('"progress":{"completos":1}');
  });
});
