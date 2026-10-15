import { describe, expect, it } from 'vitest';
import { loadProgress, saveProgress } from '@/lib/client/progress-storage';
import { emptyProgress } from '@/lib/onboarding/state';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('progreso en el navegador', () => {
  it('guarda y recupera por laboratorio', () => {
    const s = memory();
    const p = emptyProgress('lab-a');
    p.steps.usuarios = { status: 'completo', lastFile: 'u.xlsx' };
    expect(saveProgress(p, s)).toBe(true);
    expect(loadProgress('lab-a', s)).toEqual(p);
    expect(loadProgress('lab-b', s)).toEqual(emptyProgress('lab-b'));
  });

  it('sin almacenamiento, con JSON roto o si el navegador lo bloquea, arranca vacío', () => {
    expect(loadProgress('lab-a', undefined)).toEqual(emptyProgress('lab-a'));
    const s = memory();
    s.m.set('optacost-onboarding:progreso:lab-a', '{roto');
    expect(loadProgress('lab-a', s)).toEqual(emptyProgress('lab-a'));
    const blocked = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('lleno'); } };
    expect(loadProgress('lab-a', blocked)).toEqual(emptyProgress('lab-a'));
    expect(saveProgress(emptyProgress('lab-a'), blocked)).toBe(false);
  });
});
