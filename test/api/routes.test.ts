import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { csvBytes, xlsxBytes } from '../helpers';

beforeAll(async () => {
  process.env.ONBOARDING_DIR = await mkdtemp(join(tmpdir(), 'api-'));
});

async function upload(bytes: Uint8Array, name: string) {
  const { POST } = await import('@/app/api/upload/route');
  const form = new FormData();
  form.append('file', new File([bytes as BlobPart], name));
  return POST(new Request('http://test/api/upload', { method: 'POST', body: form }));
}

describe('POST /api/upload', () => {
  it('parsea y devuelve fileId', async () => {
    const res = await upload(xlsxBytes({ Usuarios: [['Nombre completo', 'Email', 'Rol'], ['Ana', 'a@x.com', 'Editor']] }), 'u.xlsx');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ nombre: 'u.xlsx', hojas: ['Usuarios'], filas: 1 });
    expect(data.fileId).toMatch(/^f_/);
    const { fileStore } = await import('@/lib/files/store');
    expect(fileStore.get(data.fileId)?.fileName).toBe('u.xlsx');
  });

  it('400 con motivo en español', async () => {
    const res = await upload(csvBytes('x'), 'a.pdf');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Formato no soportado');
  });

  it('400 sin archivo', async () => {
    const { POST } = await import('@/app/api/upload/route');
    const res = await POST(new Request('http://test/api/upload', { method: 'POST', body: new FormData() }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/progress', () => {
  it('devuelve los 14 pasos', async () => {
    const { GET } = await import('@/app/api/progress/route');
    const res = await GET(new Request('http://test/api/progress?lab=prueba'));
    expect(res.status).toBe(200);
    expect((await res.json()).pasos).toHaveLength(14);
  });
  it('400 con lab inválido', async () => {
    const { GET } = await import('@/app/api/progress/route');
    expect((await GET(new Request('http://test/api/progress?lab=../x'))).status).toBe(400);
  });
});
