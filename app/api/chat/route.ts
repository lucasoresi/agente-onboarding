import type { UIMessage } from 'ai';
import { getModel } from '@/lib/agent/model';
import { buildInstructions } from '@/lib/agent/prompt';
import { streamAgentResponse } from '@/lib/agent/run';
import { fileStore } from '@/lib/files/store';
import { DEFAULT_LAB, LAB_ID } from '@/lib/onboarding/lab';
import { getProgressStore } from '@/lib/onboarding/state';
import { connectDocs, DEFAULT_MCP_URL } from '@/lib/tools/mcp';
import { createProgressTools } from '@/lib/tools/progress';
import { createValidateTool } from '@/lib/tools/validate';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json()) as { messages?: UIMessage[]; lab?: string };
  const lab = body.lab ?? DEFAULT_LAB;
  if (!LAB_ID.test(lab) || !Array.isArray(body.messages)) {
    return Response.json({ error: 'Solicitud inválida.' }, { status: 400 });
  }

  let model;
  try {
    model = getModel();
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Modelo no configurado.' }, { status: 500 });
  }

  const docs = await connectDocs(process.env.OPTACOST_MCP_URL || DEFAULT_MCP_URL);
  const progress = getProgressStore();
  const tools = {
    ...docs.tools,
    validar_archivo: createValidateTool({ files: fileStore, progress, lab }),
    ...createProgressTools({ progress, lab }),
  };

  try {
    return await streamAgentResponse(body.messages, {
      model,
      tools,
      instructions: buildInstructions({ skill: docs.skill, docsAvailable: docs.available }),
      docsAvailable: docs.available,
      onEnd: docs.close,
      abortSignal: req.signal,
    });
  } catch (e) {
    await docs.close();
    throw e;
  }
}
