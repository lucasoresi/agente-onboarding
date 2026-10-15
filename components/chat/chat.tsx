'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ProgressPanel } from '@/components/progress-panel';
import { loadProgress, saveProgress } from '@/lib/client/progress-storage';
import { attachmentText, latestAttachmentId, prepareAttachment, type UploadResult } from '@/lib/client/upload';
import type { AttachmentPayload } from '@/lib/files/attachment';
import { normalizeProgress, type LabProgress } from '@/lib/onboarding/state';
import { AlertIcon, ArrowRightIcon, FileIcon, LogoMark, PaperclipIcon, SpinnerIcon, XIcon } from '@/components/icons';
import { MessageView } from './message-view';

const SUGGESTIONS = ['Quiero empezar el onboarding', '¿Qué datos tengo que preparar según la documentación?', '¿Cómo voy con el onboarding?'];

export function Chat({ lab }: { lab: string }) {
  // El servidor no guarda nada: el progreso vive en este navegador y viaja con cada mensaje junto con el último adjunto.
  const progressRef = useRef<LabProgress | null>(null);
  const filesRef = useRef(new Map<string, AttachmentPayload>());
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ id, messages, body, trigger, messageId }) => {
          const last = latestAttachmentId(messages);
          return {
            body: {
              ...body,
              id,
              messages,
              trigger,
              messageId,
              lab,
              progress: progressRef.current,
              archivo: last ? filesRef.current.get(last) : undefined,
            },
          };
        },
      }),
  );
  const { messages, sendMessage, status, error, regenerate } = useChat({ transport });
  const [progress, setProgress] = useState<LabProgress | null>(null);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Si la persona subió a leer un mensaje anterior, no la arrastramos hacia abajo mientras llega la respuesta.
  const stickToBottom = useRef(true);

  const busy = status === 'submitted' || status === 'streaming';
  const docsUnavailable = messages.some(
    (m) => m.role === 'assistant' && (m.metadata as { docsAvailable?: boolean } | undefined)?.docsAvailable === false,
  );

  useEffect(() => {
    const el = scroller.current;
    const last = messages[messages.length - 1];
    if (!el || (!stickToBottom.current && last?.role !== 'user')) return;
    // Solo se desplaza la lista de mensajes: scrollIntoView movía también la página entera.
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const p = loadProgress(lab);
    progressRef.current = p;
    setProgress(p);
  }, [lab]);

  // El servidor devuelve el progreso actualizado en la metadata de la respuesta: se guarda en el navegador.
  useEffect(() => {
    const last = messages.findLast((m) => m.role === 'assistant');
    const raw = (last?.metadata as { progress?: unknown } | undefined)?.progress;
    if (raw === undefined) return;
    const next = normalizeProgress(raw, lab);
    if (JSON.stringify(next) === JSON.stringify(progressRef.current)) return;
    progressRef.current = next;
    setProgress(next);
    setStorageBlocked(!saveProgress(next));
  }, [messages, lab]);

  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const { meta, payload } = await prepareAttachment(file);
      filesRef.current.set(meta.fileId, payload);
      // Solo se manda el último adjunto: los anteriores no hace falta tenerlos en memoria.
      for (const id of filesRef.current.keys()) if (filesRef.current.size > 3 && id !== meta.fileId) filesRef.current.delete(id);
      setAttachment(meta);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
    } finally {
      setUploading(false);
    }
  }

  function send(text: string) {
    const t = text.trim();
    if (busy || uploading || (!t && !attachment)) return;
    const full = attachment ? `${t || 'Validá este archivo.'}\n\n${attachmentText(attachment)}` : t;
    void sendMessage({ text: full });
    setInput('');
    setAttachment(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-50 text-zinc-950">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 bg-white px-7 py-3.5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-950 text-white">
            <LogoMark size={16} />
          </div>
          <span className="text-[17px] font-bold tracking-tight">optacost</span>
          <span className="h-5 w-px bg-zinc-200" aria-hidden />
          <h1 className="text-[15px] font-semibold">Onboarding</h1>
        </div>
        <p className="flex items-center gap-2 text-[13px] text-zinc-600">
          Laboratorio
          <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 font-medium text-zinc-950">{lab}</span>
        </p>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          {storageBlocked && (
            <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-7 py-2 text-xs text-amber-900">
              <AlertIcon size={14} />
              Este navegador no permite guardar el progreso: si cerrás o recargás la página, se pierde.
            </div>
          )}
          {docsUnavailable && (
            <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-7 py-2 text-xs text-amber-900">
              <AlertIcon size={14} />
              La documentación de Optacost no está disponible ahora. Podés seguir validando archivos.
            </div>
          )}

          <div
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            className="flex-1 overflow-y-auto px-6 pb-6 pt-8"
          >
            <div className="mx-auto flex max-w-[760px] flex-col gap-5">
              {messages.length === 0 && (
                <div className="mx-auto mt-6 w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-7 text-sm shadow-sm">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-white">
                    <LogoMark size={20} />
                  </div>
                  <p className="text-base font-semibold">¡Hola! Soy el asistente de onboarding de Optacost.</p>
                  <p className="mt-2 leading-relaxed text-zinc-600">
                    Te guío para preparar los datos del laboratorio y reviso tus planillas (.xlsx o .csv) antes de enviarlas.
                    Adjuntá un archivo o preguntame lo que necesites.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m) => (
                <MessageView key={m.id} message={m} />
              ))}
              {status === 'submitted' && (
                <p className="ml-11 inline-flex items-center gap-2 text-xs text-zinc-500">
                  <SpinnerIcon size={14} />
                  Pensando…
                </p>
              )}
              {error && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
                  <AlertIcon size={14} />
                  <span>{error.message || 'Ocurrió un error.'}</span>
                  <button type="button" className="font-semibold underline underline-offset-2" onClick={() => void regenerate()}>
                    Reintentar
                  </button>
                </div>
              )}
            </div>
          </div>

          <form onSubmit={onSubmit} className="border-t border-zinc-200 bg-zinc-50 px-6 pb-5 pt-3.5">
            <div className="mx-auto max-w-[760px] rounded-2xl border border-zinc-200 bg-white shadow-[0_4px_16px_rgba(9,9,11,0.06)] focus-within:border-zinc-300">
              {(attachment || uploading || uploadError) && (
                <div className="flex flex-wrap items-center gap-2 px-3.5 pt-3 text-xs">
                  {uploading && (
                    <span className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-zinc-600">
                      <SpinnerIcon size={13} />
                      Leyendo archivo…
                    </span>
                  )}
                  {attachment && (
                    <span className="inline-flex items-center gap-2.5 rounded-[10px] bg-zinc-100 py-2 pl-3 pr-2">
                      <FileIcon size={15} className="text-zinc-500" />
                      <span className="flex flex-col">
                        <strong className="font-semibold">{attachment.nombre}</strong>
                        <span className="text-zinc-500">{attachment.filas} filas</span>
                      </span>
                      <button
                        type="button"
                        aria-label="Quitar adjunto"
                        onClick={() => setAttachment(null)}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-zinc-600 hover:text-zinc-950"
                      >
                        <XIcon size={12} />
                      </button>
                    </span>
                  )}
                  {uploadError && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-red-700">
                      <AlertIcon size={13} />
                      {uploadError}
                    </span>
                  )}
                </div>
              )}
              <input ref={fileInput} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onPickFile} />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={attachment ? 'Agregá un comentario (opcional) y enviá' : 'Escribí tu consulta…'}
                aria-label="Mensaje"
                className="block h-12 w-full bg-transparent px-4 text-[15px] text-zinc-950 outline-none placeholder:text-zinc-400"
              />
              <div className="flex items-center justify-between px-2.5 pb-2.5">
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={busy || uploading}
                  className="flex h-9 items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-3 text-[13px] text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                  aria-label="Adjuntar archivo"
                >
                  <PaperclipIcon size={15} />
                  Adjuntar
                </button>
                <button
                  type="submit"
                  disabled={busy || uploading || (!input.trim() && !attachment)}
                  className="flex h-9 items-center gap-1.5 rounded-[10px] bg-brand px-4 text-[13px] font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
                >
                  Enviar
                  <ArrowRightIcon size={14} />
                </button>
              </div>
            </div>
          </form>
        </main>

        <aside className="hidden w-[340px] shrink-0 overflow-y-auto border-l border-zinc-200 bg-white md:block">
          <ProgressPanel progress={progress} />
        </aside>
      </div>
    </div>
  );
}
