import { gunzipSync } from 'node:zlib';
import type { ParsedFile } from '@/lib/validation/types';
import { readFile } from '@/lib/validation/read';

/** Archivo adjunto que manda el navegador con cada mensaje: bytes originales, comprimidos con gzip y en base64. */
export type AttachmentPayload = { fileId: string; nombre: string; gz: string };

/** Vercel limita el cuerpo de un request a 4,5 MB: dejamos lugar para la conversación. */
export const MAX_COMPRESSED_BYTES = 3 * 1024 * 1024;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const FILE_ID = /^f_[a-z0-9]{1,32}$/;

/** Devuelve el archivo parseado, o undefined si el adjunto falta o es inválido (la tool pide volver a adjuntarlo). */
export function decodeAttachment(raw: unknown): { fileId: string; file: ParsedFile } | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { fileId, nombre, gz } = raw as Partial<AttachmentPayload>;
  if (typeof fileId !== 'string' || !FILE_ID.test(fileId) || typeof nombre !== 'string' || typeof gz !== 'string') return undefined;
  if (gz.length > Math.ceil((MAX_COMPRESSED_BYTES * 4) / 3) + 4) return undefined;
  try {
    const bytes = gunzipSync(Buffer.from(gz, 'base64'), { maxOutputLength: MAX_FILE_BYTES });
    return { fileId, file: readFile(new Uint8Array(bytes), nombre) };
  } catch {
    return undefined;
  }
}
