import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

export function textStream(text: string) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'text-start' as const, id: 't1' },
        { type: 'text-delta' as const, id: 't1', delta: text },
        { type: 'text-end' as const, id: 't1' },
        { type: 'finish' as const, finishReason: { unified: 'stop' as const, raw: undefined }, logprobs: undefined, usage },
      ],
    }),
  };
}

export function toolCallStream(toolName: string, input: object) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'tool-call' as const, toolCallId: 'c1', toolName, input: JSON.stringify(input) },
        { type: 'finish' as const, finishReason: { unified: 'tool-calls' as const, raw: undefined }, logprobs: undefined, usage },
      ],
    }),
  };
}

/** Modelo que devuelve un stream distinto en cada llamada. */
export function scriptedModel(...steps: (() => { stream: ReadableStream<any> })[]) {
  let i = 0;
  return new MockLanguageModelV4({ doStream: async () => steps[Math.min(i++, steps.length - 1)]() });
}
