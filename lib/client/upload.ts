export type UploadResult = { fileId: string; nombre: string; hojas: string[]; filas: number };

export const ATTACHMENT_RE = /\[Archivo adjunto: (.+?) — fileId: (f_[a-z0-9]+)\]/;

export function attachmentText(a: UploadResult): string {
  return `[Archivo adjunto: ${a.nombre} — fileId: ${a.fileId}]`;
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const data = (await res.json().catch(() => ({}))) as Partial<UploadResult> & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'No se pudo subir el archivo.');
  return data as UploadResult;
}
