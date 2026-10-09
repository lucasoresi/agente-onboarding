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
};

export function friendlyError(error: unknown): string {
  const e = RetryError.isInstance(error) ? error.lastError : error;
  if (isRateLimit(e)) return 'Se alcanzó el límite gratuito de Gemini. Esperá un minuto y reenviá el mensaje.';
  if (APICallError.isInstance(e) && (e.statusCode ?? 0) >= 500) {
    return 'Gemini no está respondiendo en este momento. Probá de nuevo en unos segundos.';
  }
  console.error('[agent]', e);
  return 'Ocurrió un error inesperado al generar la respuesta. Probá de nuevo.';
}

export async function streamAgentResponse(messages: UIMessage[], deps: AgentDeps): Promise<Response> {
  const result = streamText({
    model: deps.model,
    instructions: deps.instructions,
    messages: await convertToModelMessages(messages, { tools: deps.tools, ignoreIncompleteToolCalls: true }),
    tools: deps.tools,
    stopWhen: isStepCount(6),
    maxRetries: deps.maxRetries ?? 3,
    onEnd: async () => {
      await deps.onEnd?.();
    },
  });
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onError: friendlyError,
      messageMetadata: ({ part }) => (part.type === 'start' ? { docsAvailable: deps.docsAvailable } : undefined),
    }),
  });
}
