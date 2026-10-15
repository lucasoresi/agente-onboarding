import type { UIMessage } from 'ai';
import type { AttachmentPayload } from '@/lib/files/attachment';
import { readFile } from '@/lib/validation/read';

export type UploadResult = { fileId: string; nombre: string; hojas: string[]; filas: number };

export const ATTACHMENT_RE = /\[Archivo adjunto: (.+?) — fileId: (f_[a-z0-9]+)\]/;
const ATTACHMENT_RE_ALL = new RegExp(ATTACHMENT_RE.source, 'g');

// Duplicados de lib/files/attachment.ts: ese módulo usa node:zlib y no puede entrar al bundle del navegador.
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_COMPRESSED_BYTES = 3 * 1024 * 1024;

export function attachmentText(a: UploadResult): string {
  return `[Archivo adjunto: ${a.nombre} — fileId: ${a.fileId}]`;
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Lee el archivo en el navegador: lo parsea para avisar enseguida si no se puede leer y lo deja comprimido,
 * listo para mandarlo con el mensaje. El servidor no guarda archivos.
 */
export async function prepareAttachment(file: File): Promise<{ meta: UploadResult; payload: AttachmentPayload }> {
  if (file.size > MAX_FILE_BYTES) throw new Error('El archivo supera el máximo de 10 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = readFile(bytes, file.name);
  const gz = await gzip(bytes);
  if (gz.length > MAX_COMPRESSED_BYTES) {
    throw new Error('El archivo es demasiado grande para validarlo acá. Probá dividirlo en partes más chicas.');
  }
  const fileId = `f_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  return {
    meta: {
      fileId,
      nombre: file.name,
      hojas: parsed.sheets.map((s) => s.name),
      filas: parsed.sheets.reduce((n, s) => n + Math.max(0, s.lines.length - 1), 0),
    },
    payload: { fileId, nombre: file.name, gz: toBase64(gz) },
  };
}

/** fileId del último archivo adjuntado en la conversación: es el único que se manda con cada mensaje. */
export function latestAttachmentId(messages: UIMessage[]): string | undefined {
  let last: string | undefined;
  for (const m of messages) {
    if (m.role !== 'user') continue;
    for (const p of m.parts) if (p.type === 'text') for (const match of p.text.matchAll(ATTACHMENT_RE_ALL)) last = match[2];
  }
  return last;
}
