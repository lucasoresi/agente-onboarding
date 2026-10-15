import { describe, expect, it, vi } from 'vitest';

const close = vi.fn(async () => {});

vi.mock('@/lib/tools/mcp', () => ({
  DEFAULT_MCP_URL: 'http://mcp.test',
  connectDocs: vi.fn(async () => ({ tools: {}, skill: '', available: false, close })),
}));
vi.mock('@/lib/agent/model', () => ({ getModel: () => ({}) }));

describe('POST /api/chat', () => {
  it('cierra el cliente MCP si falla el armado del stream', async () => {
    const { POST } = await import('@/app/api/chat/route');
    const req = new Request('http://test/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', parts: [{ type: 'bogus-part' }] }] }),
    });
    await expect(POST(req)).rejects.toThrow();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
