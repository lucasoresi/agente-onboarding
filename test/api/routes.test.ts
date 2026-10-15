import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProgress } from '@/lib/onboarding/state';
import { prepareAttachment } from '@/lib/client/upload';
import { xlsxBytes } from '../helpers';

const captured: { deps?: any; messages?: unknown } = {};

vi.mock('@/lib/tools/mcp', () => ({
  DEFAULT_MCP_URL: 'http://mcp.test',
  connectDocs: vi.fn(async () => ({ tools: {}, skill: '', available: false, close: async () => {} })),
}));
vi.mock('@/lib/agent/model', () => ({ getModel: () => ({}) }));
vi.mock('@/lib/agent/run', () => ({
  streamAgentResponse: vi.fn(async (messages: unknown, deps: unknown) => {
    captured.messages = messages;
    captured.deps = deps;
    return new Response('ok');
  }),
}));

const post = async (body: unknown) => {
  const { POST } = await import('@/app/api/chat/route');
  return POST(new Request('http://test/api/chat', { method: 'POST', body: JSON.stringify(body) }));
};
const messages = [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hola' }] }];

beforeEach(() => {
  captured.deps = undefined;
});

describe('POST /api/chat sin estado en el servidor', () => {
  it('400 con lab inválido o sin mensajes', async () => {
    expect((await post({ lab: '../x', messages })).status).toBe(400);
    expect((await post({ lab: 'prueba' })).status).toBe(400);
  });

  it('las tools trabajan sobre el progreso que manda el navegador y lo devuelven', async () => {
    const progress = emptyProgress('prueba');
    progress.steps.usuarios = { status: 'completo', lastFile: 'u.xlsx' };
    expect((await post({ lab: 'prueba', messages, progress })).status).toBe(200);
    const out = await captured.deps.tools.ver_progreso.execute({}, { toolCallId: 't', messages: [] });
    expect(out.completos).toBe(1);
    expect(captured.deps.progressSnapshot().steps.usuarios.status).toBe('completo');
  });

  it('valida el archivo adjunto que viene en el request', async () => {
    const bytes = xlsxBytes({ Usuarios: [['Nombre completo', 'Email', 'Rol'], ['Ana Perez', 'a@x.com', 'Editor']] });
    const { payload } = await prepareAttachment(new File([bytes as BlobPart], '2026-07-15_Usuarios.xlsx'));
    await post({ lab: 'prueba', messages, archivo: payload });
    const out = await captured.deps.tools.validar_archivo.execute({ fileId: payload.fileId }, { toolCallId: 't', messages: [] });
    expect(JSON.stringify(out)).not.toContain('no está disponible');
    expect(captured.deps.progressSnapshot().steps.usuarios.status).not.toBe('pendiente');
  });

  it('un progreso roto del navegador arranca vacío', async () => {
    await post({ lab: 'prueba', messages, progress: 'basura' });
    expect(captured.deps.progressSnapshot()).toEqual(emptyProgress('prueba'));
  });
});

describe('límite de tiempo en Vercel', () => {
  it('alcanza para los 6 pasos del agente de hasta 45 s cada uno', async () => {
    const { maxDuration } = await import('@/app/api/chat/route');
    expect(maxDuration).toBeGreaterThanOrEqual(6 * 45);
  });
});
