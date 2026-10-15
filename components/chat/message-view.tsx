'use client';

import type { UIMessage } from 'ai';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AlertIcon, BookIcon, CheckIcon, FileIcon, ListCheckIcon, SpinnerIcon } from '@/components/icons';
import { ValidationReportCard } from '@/components/validation-report';
import { ATTACHMENT_RE } from '@/lib/client/upload';
import type { ValidateOutput } from '@/lib/tools/validate';

type ToolPart = { type: string; toolName?: string; state: string; output?: unknown; errorText?: string };

const TOOL_LABELS: Record<string, [running: string, done: string]> = {
  search_optacost: ['Buscando en la documentación…', 'Documentación consultada'],
  query_docs_filesystem_optacost: ['Leyendo la documentación…', 'Documentación consultada'],
  ver_progreso: ['Revisando el progreso…', 'Progreso consultado'],
  marcar_paso: ['Actualizando el progreso…', 'Progreso actualizado'],
  validar_archivo: ['Validando archivo…', ''],
};

const TOOL_ICONS: Record<string, ReactNode> = {
  search_optacost: <BookIcon size={13} />,
  query_docs_filesystem_optacost: <BookIcon size={13} />,
  ver_progreso: <ListCheckIcon size={13} />,
  marcar_paso: <CheckIcon size={13} />,
};

function toolNameOf(part: ToolPart): string {
  return part.type === 'dynamic-tool' ? (part.toolName ?? '') : part.type.slice('tool-'.length);
}

function ToolView({ part }: { part: ToolPart }) {
  const name = toolNameOf(part);
  if (part.state === 'output-error') {
    return (
      <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
        <AlertIcon size={13} />
        Falló {name}: {part.errorText}
      </p>
    );
  }
  if (name === 'validar_archivo' && part.state === 'output-available') {
    return <ValidationReportCard output={part.output as ValidateOutput} />;
  }
  if (name === 'marcar_paso' && part.state === 'output-available' && (part.output as { ok?: boolean })?.ok === false) {
    return null;
  }
  const [running, done] = TOOL_LABELS[name] ?? ['Procesando…', 'Listo'];
  const finished = part.state === 'output-available';
  const label = finished ? done : running;
  if (!label) return null;
  return (
    <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
      {finished ? (TOOL_ICONS[name] ?? <CheckIcon size={13} />) : <SpinnerIcon size={13} />}
      {label}
    </p>
  );
}

function UserText({ text }: { text: string }) {
  const m = ATTACHMENT_RE.exec(text);
  const clean = text.replace(ATTACHMENT_RE, '').trim();
  return (
    <>
      {clean && (
        <p className="whitespace-pre-wrap rounded-2xl rounded-br-sm bg-zinc-950 px-4 py-2.5 text-sm leading-relaxed text-white">{clean}</p>
      )}
      {m && (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700">
          <FileIcon size={13} />
          {m[1]}
        </span>
      )}
    </>
  );
}

export function MessageView({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex max-w-[80%] flex-col items-end gap-1.5 self-end">
        {message.parts.map((part, i) => (part.type === 'text' ? <UserText key={i} text={part.text} /> : null))}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-700">
        O
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 text-sm leading-relaxed text-zinc-950">
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            return (
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
