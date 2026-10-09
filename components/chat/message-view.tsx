'use client';

import type { UIMessage } from 'ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ValidationReportCard } from '@/components/validation-report';
import { ATTACHMENT_RE } from '@/lib/client/upload';
import type { ValidateOutput } from '@/lib/tools/validate';

type ToolPart = { type: string; toolName?: string; state: string; output?: unknown; errorText?: string };

const TOOL_LABELS: Record<string, [running: string, done: string]> = {
  search_optacost: ['🔎 Buscando en la documentación…', '📄 Documentación consultada'],
  query_docs_filesystem_optacost: ['📖 Leyendo la documentación…', '📄 Documentación consultada'],
  ver_progreso: ['Revisando el progreso…', '📋 Progreso consultado'],
  marcar_paso: ['Actualizando el progreso…', '✅ Progreso actualizado'],
  validar_archivo: ['🧪 Validando archivo…', ''],
};

function toolNameOf(part: ToolPart): string {
  return part.type === 'dynamic-tool' ? (part.toolName ?? '') : part.type.slice('tool-'.length);
}

function ToolView({ part }: { part: ToolPart }) {
  const name = toolNameOf(part);
  if (part.state === 'output-error') return <p className="text-xs text-red-700">⚠️ Falló {name}: {part.errorText}</p>;
  if (name === 'validar_archivo' && part.state === 'output-available') {
    return <ValidationReportCard output={part.output as ValidateOutput} />;
  }
  if (name === 'marcar_paso' && part.state === 'output-available' && (part.output as { ok?: boolean })?.ok === false) {
    return null;
  }
  const [running, done] = TOOL_LABELS[name] ?? ['Procesando…', 'Listo'];
  const label = part.state === 'output-available' ? done : running;
  return label ? <p className="text-xs text-slate-500">{label}</p> : null;
}

function UserText({ text }: { text: string }) {
  const m = ATTACHMENT_RE.exec(text);
  const clean = text.replace(ATTACHMENT_RE, '').trim();
  return (
    <div className="space-y-2">
      {clean && <p className="whitespace-pre-wrap">{clean}</p>}
      {m && <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-xs">📎 {m[1]}</span>}
    </div>
  );
}

export function MessageView({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] space-y-2 rounded-2xl px-4 py-3 text-sm ${
          isUser ? 'bg-slate-900 text-white' : 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
        }`}
      >
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            return isUser ? (
              <UserText key={i} text={part.text} />
            ) : (
              <div key={i} className="markdown">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer" /> }}
                >
                  {part.text}
                </ReactMarkdown>
              </div>
            );
          }
          if (part.type === 'dynamic-tool' || part.type.startsWith('tool-')) {
            return <ToolView key={i} part={part as unknown as ToolPart} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}
