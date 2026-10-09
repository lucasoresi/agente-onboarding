import { describe, expect, it } from 'vitest';
import { ATTACHMENT_RE, attachmentText } from '@/lib/client/upload';

describe('marcador de adjunto', () => {
  it('ida y vuelta nombre/fileId', () => {
    const text = `Validá esto\n\n${attachmentText({ fileId: 'f_ab12cd34ef56', nombre: '2026-07-15_Usuarios.xlsx', hojas: [], filas: 3 })}`;
    const m = ATTACHMENT_RE.exec(text);
    expect(m?.[1]).toBe('2026-07-15_Usuarios.xlsx');
    expect(m?.[2]).toBe('f_ab12cd34ef56');
  });
});
