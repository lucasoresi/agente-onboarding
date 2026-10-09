import { describe, expect, it } from 'vitest';
import { buildInstructions } from '@/lib/agent/prompt';
import { STEPS } from '@/lib/onboarding/steps';

describe('buildInstructions', () => {
  it('incluye los 14 pasos, la convención de adjuntos y la skill', () => {
    const s = buildInstructions({ docsAvailable: true, lab: 'labmedicina', skill: 'GUIA-XYZ' });
    for (const step of STEPS) expect(s).toContain(step.title);
    expect(s).toContain('fileId');
    expect(s).toContain('GUIA-XYZ');
    expect(s).toContain('https://www.optacost.com/docs');
    expect(s).not.toContain('no está disponible');
  });
  it('avisa cuando la documentación no está disponible', () => {
    expect(buildInstructions({ docsAvailable: false, lab: 'x' })).toContain('no está disponible');
  });
});
