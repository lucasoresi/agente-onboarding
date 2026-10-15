import { tool, type UIMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { firstToolFor, streamAgentResponse } from '@/lib/agent/run';
import { buildInstructions } from '@/lib/agent/prompt';
import { textStream, toolCallStream } from './mock-model';

const msg = (text: string): UIMessage[] => [{ id: 'm1', role: 'user', parts: [{ type: 'text', text }] }];

describe('firstToolFor', () => {
  it('fuerza ver_progreso con las sugerencias de inicio', () => {
    expect(firstToolFor(msg('Quiero empezar el onboarding'))).toBe('ver_progreso');
    expect(firstToolFor(msg('¿Cómo voy con el onboarding?'))).toBe('ver_progreso');
    expect(firstToolFor(msg('  quiero EMPEZAR el onboarding.  '))).toBe('ver_progreso');
  });
  it('no fuerza nada con otras preguntas ni con adjuntos', () => {
    expect(firstToolFor(msg('¿Qué datos tengo que preparar según la documentación?'))).toBeUndefined();
    expect(firstToolFor(msg('hola'))).toBeUndefined();
    expect(firstToolFor(msg('Quiero empezar el onboarding\n[Archivo adjunto: a.xlsx — fileId: f_abc123]'))).toBeUndefined();
  });
  it('mira solo el último mensaje del usuario', () => {
    const msgs: UIMessage[] = [
      ...msg('Quiero empezar el onboarding'),
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Vamos.' }] },
      { id: 'm2', role: 'user', parts: [{ type: 'text', text: 'gracias' }] },
    ];
    expect(firstToolFor(msgs)).toBeUndefined();
  });
});

describe('streamAgentResponse: primera acción forzada', () => {
  it('el primer paso obliga a llamar ver_progreso y el segundo no', async () => {
    const choices: unknown[] = [];
    let i = 0;
    const model = new MockLanguageModelV4({
      doStream: async (opts) => {
        choices.push(opts.toolChoice);
        return i++ === 0 ? toolCallStream('ver_progreso', {}) : textStream('Arrancamos por el paso 1.');
      },
    });
    const tools = { ver_progreso: tool({ inputSchema: z.object({}), execute: async () => ({ completos: 0 }) }) };
    const res = await streamAgentResponse(msg('Quiero empezar el onboarding'), {
      model, tools, instructions: 'x', docsAvailable: true, maxRetries: 0,
    });
    expect(await res.text()).toContain('Arrancamos por el paso 1.');
    expect(choices[0]).toEqual({ type: 'tool', toolName: 'ver_progreso' });
    expect(choices[1]).not.toEqual({ type: 'tool', toolName: 'ver_progreso' });
  });

  it('no fuerza si la tool no existe', async () => {
    const choices: unknown[] = [];
    const model = new MockLanguageModelV4({
      doStream: async (opts) => { choices.push(opts.toolChoice); return textStream('ok'); },
    });
    await (await streamAgentResponse(msg('Quiero empezar el onboarding'), {
      model, tools: {}, instructions: 'x', docsAvailable: true, maxRetries: 0,
    })).text();
    expect(choices[0]).not.toEqual({ type: 'tool', toolName: 'ver_progreso' });
  });
});

describe('prompt: no anunciar herramientas', () => {
  it('pide llamar la herramienta en vez de anunciarla', () => {
    const p = buildInstructions({ docsAvailable: true });
    expect(p).toContain('Nunca anuncies que vas a usar una herramienta');
  });
});
