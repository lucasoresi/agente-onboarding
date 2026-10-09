'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ProgressPanel } from '@/components/progress-panel';
import { attachmentText, uploadFile, type UploadResult } from '@/lib/client/upload';
import { MessageView } from './message-view';

const SUGGESTIONS = ['Quiero empezar el onboarding', '¿Qué datos tengo que preparar según la documentación?', '¿Cómo voy con el onboarding?'];

export function Chat({ lab }: { lab: string }) {
  const [transport] = useState(() => new DefaultChatTransport({ api: '/api/chat', body: { lab } }));
  const { messages, sendMessage, status, error, regenerate } = useChat({ transport });
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [progressVersion, setProgressVersion] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const busy = status === 'submitted' || status === 'streaming';
  const docsUnavailable = messages.some(
    (m) => m.role === 'assistant' && (m.metadata as { docsAvailable?: boolean } | undefined)?.docsAvailable === false,
  );

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (status === 'ready' || status === 'error') setProgressVersion((v) => v + 1);
  }, [status]);

  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      setAttachment(await uploadFile(file));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'No se pudo subir el archivo.');
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
    <div className="flex h-screen">
      <main className="flex flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-6 py-3">
          <h1 className="text-base font-semibold">Onboarding Optacost</h1>
          <p className="text-xs text-slate-500">Laboratorio: {lab}</p>
        </header>

        {docsUnavailable && (
          <div className="border-b border-amber-300 bg-amber-50 px-6 py-2 text-xs text-amber-900">
            La documentación de Optacost no está disponible ahora. Podés seguir validando archivos.
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {messages.length === 0 && (
            <div className="mx-auto max-w-xl rounded-2xl bg-white p-6 text-sm shadow-sm ring-1 ring-slate-200">
              <p className="font-semibold">¡Hola! Soy el asistente de onboarding de Optacost.</p>
              <p className="mt-2 text-slate-600">
                Te guío para preparar los datos del laboratorio y reviso tus planillas (.xlsx o .csv) antes de enviarlas.
                Adjuntá un archivo con 📎 o preguntame lo que necesites.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <MessageView key={m.id} message={m} />
          ))}
          {status === 'submitted' && <p className="text-xs text-slate-500">Pensando…</p>}
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800">
              {error.message || 'Ocurrió un error.'}{' '}
              <button type="button" className="underline" onClick={() => void regenerate()}>
                Reintentar
              </button>
            </div>
          )}
          <div ref={bottom} />
        </div>

        <form onSubmit={onSubmit} className="border-t border-slate-200 bg-white px-6 py-3">
          {(attachment || uploading || uploadError) && (
            <div className="mb-2 flex items-center gap-2 text-xs">
              {uploading && <span className="text-slate-500">Subiendo archivo…</span>}
              {attachment && (
                <span className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1">
                  📎 {attachment.nombre} · {attachment.filas} filas
                  <button type="button" aria-label="Quitar adjunto" onClick={() => setAttachment(null)}>
                    ✕
                  </button>
                </span>
              )}
              {uploadError && <span className="text-red-700">{uploadError}</span>}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input ref={fileInput} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onPickFile} />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy || uploading}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
              aria-label="Adjuntar archivo"
            >
              📎
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={attachment ? 'Agregá un comentario (opcional) y enviá' : 'Escribí tu consulta…'}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
            <button
              type="submit"
              disabled={busy || uploading || (!input.trim() && !attachment)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
        </form>
      </main>

      <aside className="hidden w-80 overflow-y-auto border-l border-slate-200 bg-white md:block">
        <ProgressPanel lab={lab} version={progressVersion} />
      </aside>
    </div>
  );
}
