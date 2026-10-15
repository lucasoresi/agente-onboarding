import { describe, expect, it } from 'vitest';
import { decodeAttachment, MAX_COMPRESSED_BYTES } from '@/lib/files/attachment';
import { latestAttachmentId, prepareAttachment } from '@/lib/client/upload';
import { readFile } from '@/lib/validation/read';
import type { UIMessage } from 'ai';
import { csvBytes, xlsxBytes } from '../helpers';

const file = (bytes: Uint8Array, name: string) => new File([bytes as BlobPart], name);

describe('adjuntos enviados desde el navegador', () => {
  it('ida y vuelta: el servidor obtiene el mismo archivo parseado', async () => {
    const bytes = xlsxBytes({ Usuarios: [['Nombre completo', 'Email', 'Rol'], ['Ana', 'a@x.com', 'Editor']] });
    const { meta, payload } = await prepareAttachment(file(bytes, 'u.xlsx'));
    expect(meta).toMatchObject({ nombre: 'u.xlsx', hojas: ['Usuarios'], filas: 1 });
    expect(meta.fileId).toMatch(/^f_[a-z0-9]{12}$/);
    expect(payload.fileId).toBe(meta.fileId);
    const decoded = decodeAttachment(payload);
    expect(decoded?.fileId).toBe(meta.fileId);
    expect(decoded?.file).toEqual(readFile(bytes, 'u.xlsx'));
  });

  it('rechaza en el navegador un formato no soportado, con motivo en español', async () => {
    await expect(prepareAttachment(file(csvBytes('x'), 'a.pdf'))).rejects.toThrow('Formato no soportado');
  });

  it('el servidor ignora adjuntos inválidos o demasiado grandes', () => {
    expect(decodeAttachment(undefined)).toBeUndefined();
    expect(decodeAttachment({ fileId: 'f_abc', nombre: 'a.csv', gz: 'no-es-gzip' })).toBeUndefined();
    expect(decodeAttachment({ fileId: '../x', nombre: 'a.csv', gz: '' })).toBeUndefined();
    const huge = 'A'.repeat(Math.ceil((MAX_COMPRESSED_BYTES * 4) / 3) + 8);
    expect(decodeAttachment({ fileId: 'f_abc', nombre: 'a.csv', gz: huge })).toBeUndefined();
  });

  it('latestAttachmentId devuelve el último archivo adjuntado en la conversación', () => {
    const msgs: UIMessage[] = [
      { id: '1', role: 'user', parts: [{ type: 'text', text: 'x\n\n[Archivo adjunto: a.xlsx — fileId: f_aaa]' }] },
      { id: '2', role: 'assistant', parts: [{ type: 'text', text: 'ok' }] },
      { id: '3', role: 'user', parts: [{ type: 'text', text: 'y\n\n[Archivo adjunto: b.xlsx — fileId: f_bbb]' }] },
      { id: '4', role: 'user', parts: [{ type: 'text', text: 'son prácticas' }] },
    ];
    expect(latestAttachmentId(msgs)).toBe('f_bbb');
    expect(latestAttachmentId([])).toBeUndefined();
  });
});
