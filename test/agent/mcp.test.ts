import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectDocs, resetSkillCache, SKILL_URI } from '@/lib/tools/mcp';

type Factory = NonNullable<Parameters<typeof connectDocs>[1]>;

beforeEach(() => resetSkillCache());

describe('connectDocs', () => {
  it('pide solo las tools permitidas y lee el resource de skill', async () => {
    const client = {
      tools: vi.fn(async () => ({ search_optacost: {}, query_docs_filesystem_optacost: {} })),
      readResource: vi.fn(async () => ({ contents: [{ uri: SKILL_URI, text: 'GUIA OPTACOST' }] })),
      close: vi.fn(async () => {}),
    };
    const create = vi.fn(async () => client) as unknown as Factory;
    const docs = await connectDocs('https://docs.test/mcp', create);
    expect(docs.available).toBe(true);
    expect(docs.skill).toBe('GUIA OPTACOST');
    const schemas = (client.tools.mock.calls[0] as unknown as [{ schemas: Record<string, unknown> }])[0].schemas;
    expect(Object.keys(schemas).sort()).toEqual(['query_docs_filesystem_optacost', 'search_optacost']);
    expect(Object.keys(schemas)).not.toContain('submit_feedback');
    await docs.close();
    expect(client.close).toHaveBeenCalled();
  });

  it('cachea el resource entre conexiones', async () => {
    const client = { tools: vi.fn(async () => ({})), readResource: vi.fn(async () => ({ contents: [{ uri: SKILL_URI, text: 'S' }] })), close: vi.fn(async () => {}) };
    const create = vi.fn(async () => client) as unknown as Factory;
    await connectDocs('u', create);
    await connectDocs('u', create);
    expect(client.readResource).toHaveBeenCalledTimes(1);
  });

  it('si el MCP falla devuelve available=false sin tools', async () => {
    const create = vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as unknown as Factory;
    const docs = await connectDocs('u', create);
    expect(docs).toMatchObject({ available: false, tools: {} });
  });
});
