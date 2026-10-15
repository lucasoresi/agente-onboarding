import type { UIMessage } from 'ai';
import { getModel } from '@/lib/agent/model';
import { buildInstructions } from '@/lib/agent/prompt';
import { streamAgentResponse } from '@/lib/agent/run';
import { decodeAttachment } from '@/lib/files/attachment';
import { FileStore } from '@/lib/files/store';
import { DEFAULT_LAB, LAB_ID } from '@/lib/onboarding/lab';
import { normalizeProgress, ProgressStore } from '@/lib/onboarding/state';
import { connectDocs, DEFAULT_MCP_URL } from '@/lib/tools/mcp';
import { createProgressTools } from '@/lib/tools/progress';
import { createValidateTool } from '@/lib/tools/validate';

export const runtime = 'nodejs';
// Hasta 6 pasos de 45 s (lib/agent/run.ts). 300 s es el máximo del plan Hobby de Vercel con Fluid Compute.
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json()) as { messages?: UIMessage[]; lab?: string; progress?: unknown; archivo?: unknown };
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
  // El servidor no guarda nada: el progreso y el último archivo adjunto llegan del navegador en cada mensaje.
  const progress = new ProgressStore({ initial: [normalizeProgress(body.progress, lab)] });
  const files = new FileStore();
  const archivo = decodeAttachment(body.archivo);
  if (archivo) files.set(archivo.fileId, archivo.file);
  const tools = {
    ...docs.tools,
    validar_archivo: createValidateTool({ files, progress, lab }),
    ...createProgressTools({ progress, lab }),
  };

  try {
    return await streamAgentResponse(body.messages, {
      model,
      tools,
      instructions: buildInstructions({ skill: docs.skill, docsAvailable: docs.available }),
      docsAvailable: docs.available,
      onEnd: docs.close,
      progressSnapshot: () => progress.snapshot(lab),
      abortSignal: req.signal,
    });
  } catch (e) {
    await docs.close();
    throw e;
  }
}
