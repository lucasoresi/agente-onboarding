import { createMCPClient } from '@ai-sdk/mcp';
import type { ToolSet } from 'ai';
import { z } from 'zod';

export const DEFAULT_MCP_URL = 'https://www.optacost.com/docs/mcp';
export const SKILL_URI = 'mintlify://skills/optacost';

/** Allowlist: solo estas tools del MCP llegan al modelo (submit_feedback queda afuera). */
export const DOCS_TOOL_SCHEMAS = {
  search_optacost: {
    inputSchema: z.object({ query: z.string().describe('Texto a buscar en la documentación de Optacost') }),
  },
  query_docs_filesystem_optacost: {
    inputSchema: z.object({
      command: z.string().describe('Comando de solo lectura sobre los .mdx: rg, cat, head, tree, ls'),
    }),
  },
};

export type DocsConnection = { tools: ToolSet; skill?: string; available: boolean; close: () => Promise<void> };

let skillCache: string | undefined;

export function resetSkillCache() {
  skillCache = undefined;
}

export async function connectDocs(url: string, create: typeof createMCPClient = createMCPClient): Promise<DocsConnection> {
  try {
    const client = await create({ transport: { type: 'http', url } });
    const tools = (await client.tools({ schemas: DOCS_TOOL_SCHEMAS })) as ToolSet;
    if (skillCache === undefined) {
      try {
        const r = await client.readResource({ uri: SKILL_URI });
        skillCache = r.contents.map((c) => ('text' in c && typeof c.text === 'string' ? c.text : '')).join('\n');
      } catch {
        skillCache = '';
      }
    }
    return { tools, skill: skillCache || undefined, available: true, close: () => client.close() };
  } catch (e) {
    console.warn('[mcp] documentación no disponible:', e instanceof Error ? e.message : e);
    return { tools: {}, available: false, close: async () => {} };
  }
}
