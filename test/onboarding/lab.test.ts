import { describe, expect, it } from 'vitest';
import { LAB_ID, normalizeLab } from '@/lib/onboarding/lab';

describe('normalizeLab', () => {
  it('pasa a minúsculas, saca tildes y cambia espacios y símbolos por guiones', () => {
    expect(normalizeLab('prueba-Nanni')).toBe('prueba-nanni');
    expect(normalizeLab('Laboratorio Médico Sur')).toBe('laboratorio-medico-sur');
    expect(normalizeLab('  Lab__Peña!! ')).toBe('lab-pena');
    expect(normalizeLab('ya-valido-123')).toBe('ya-valido-123');
  });

  it('el resultado siempre es un id válido, o undefined si no queda nada', () => {
    for (const raw of ['ÁÉÍ', 'a'.repeat(60), 'x / y', 'Ñandú']) expect(LAB_ID.test(normalizeLab(raw)!)).toBe(true);
    expect(normalizeLab('!!!')).toBeUndefined();
    expect(normalizeLab('')).toBeUndefined();
  });
});
