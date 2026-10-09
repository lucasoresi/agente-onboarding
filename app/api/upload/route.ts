import { fileStore } from '@/lib/files/store';
import { readFile, ReadError } from '@/lib/validation/read';

export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024;

const badRequest = (error: string) => Response.json({ error }, { status: 400 });

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest('No recibí ningún archivo.');
  }
  const file = form.get('file');
  if (!(file instanceof File)) return badRequest('No recibí ningún archivo.');
  if (file.size > MAX_BYTES) return badRequest('El archivo supera el máximo de 10 MB.');
  try {
    const parsed = readFile(new Uint8Array(await file.arrayBuffer()), file.name);
    const fileId = fileStore.put(parsed);
    return Response.json({
      fileId,
      nombre: file.name,
      hojas: parsed.sheets.map((s) => s.name),
      filas: parsed.sheets.reduce((n, s) => n + Math.max(0, s.lines.length - 1), 0),
    });
  } catch (e) {
    if (e instanceof ReadError) return badRequest(e.message);
    throw e;
  }
}
