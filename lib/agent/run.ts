import {
  APICallError,
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  RetryError,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type ToolSet,
  type UIMessage,
} from 'ai';
import { isRateLimit } from './model';

export type AgentDeps = {
  model: LanguageModel;
  tools: ToolSet;
  instructions: string;
  docsAvailable: boolean;
  onEnd?: () => Promise<void> | void;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  /** Progreso actual del laboratorio: viaja en la metadata del mensaje para que el navegador lo guarde. */
  progressSnapshot?: () => unknown;
};

function isUnavailable(e: unknown): boolean {
  if (APICallError.isInstance(e)) return e.statusCode == null || e.statusCode >= 500 || e.isRetryable;
  return e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
}

export function friendlyError(error: unknown): string {
  const e = RetryError.isInstance(error) ? error.lastError : error;
  if (isRateLimit(e)) return 'Se alcanzó el límite gratuito de Gemini. Esperá un minuto y reenviá el mensaje.';
  if (isUnavailable(e)) {
    return 'Gemini no está respondiendo en este momento. Probá de nuevo en unos segundos.';
  }
  console.error('[agent]', e);
  return 'Ocurrió un error inesperado al generar la respuesta. Probá de nuevo.';
}

const START_INTENTS: Record<string, string> = {
  'quiero empezar el onboarding': 'ver_progreso',
  'como voy con el onboarding': 'ver_progreso',
};

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Herramienta que el primer paso debe llamar sí o sí. Con las sugerencias de inicio Gemini a veces
 * contesta "Dame un segundo" sin llamar ninguna tool y el turno termina ahí.
 */
export function firstToolFor(messages: UIMessage[]): string | undefined {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last) return undefined;
  const text = last.parts.map((p) => (p.type === 'text' ? p.text : '')).join(' ');
  if (text.includes('[Archivo adjunto:')) return undefined;
  return START_INTENTS[normalize(text)];
}

export async function streamAgentResponse(messages: UIMessage[], deps: AgentDeps): Promise<Response> {
  const forced = firstToolFor(messages);
  const forcedTool = forced && deps.tools[forced] ? forced : undefined;
  const result = streamText({
    model: deps.model,
    instructions: deps.instructions,
    messages: await convertToModelMessages(messages, { tools: deps.tools, ignoreIncompleteToolCalls: true }),
    tools: deps.tools,
    stopWhen: isStepCount(6),
    maxRetries: deps.maxRetries ?? 3,
    abortSignal: deps.abortSignal,
    timeout: { stepMs: 45_000 },
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0 && forcedTool ? { toolChoice: { type: 'tool', toolName: forcedTool } } : undefined,
  });
  // onEnd de toUIMessageStream corre al terminar, ante error de Gemini y al cancelar el cliente; se corre una sola vez.
  let ended = false;
  const closeOnce = async () => {
    if (ended) return;
    ended = true;
    await deps.onEnd?.();
  };
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onError: friendlyError,
      onEnd: closeOnce,
      messageMetadata: ({ part }) => {
        if (part.type === 'start') return { docsAvailable: deps.docsAvailable };
        // Después de cada paso (las tools ya corrieron) y al final: si un paso posterior falla, lo hecho no se pierde.
        if ((part.type === 'finish-step' || part.type === 'finish') && deps.progressSnapshot) {
          return { progress: deps.progressSnapshot() };
        }
        return undefined;
      },
    }),
  });
}
