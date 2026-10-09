import { tool } from 'ai';
import { z } from 'zod';
import type { ProgressStore } from '@/lib/onboarding/state';
import { nextPendingStep, progressView, type StepInfo } from '@/lib/onboarding/steps';
import { getSchema } from '@/lib/validation/schemas';
import { STEP_IDS } from '@/lib/validation/types';

export function stepBrief(s: StepInfo | null) {
  if (!s) return null;
  return {
    id: s.id,
    titulo: s.title,
    categoria: `${s.category} · ${s.categoryTitle}`,
    plantilla: s.templateFile,
    columnasObligatorias: s.requiredColumns,
    columnasOpcionales: s.optionalColumns,
    columnasDinamicas: s.dynamicHint ?? null,
  };
}

export function createProgressTools(deps: { progress: ProgressStore; lab: string }) {
  return {
    ver_progreso: tool({
      description: 'Muestra el estado de los 14 pasos del onboarding del laboratorio y cuál es el siguiente pendiente.',
      inputSchema: z.object({}),
      execute: async () => {
        const p = await deps.progress.load(deps.lab);
        return { ...progressView(p), siguiente: stepBrief(nextPendingStep(p)) };
      },
    }),
    marcar_paso: tool({
      description:
        'Marca un paso como completo. Solo funciona si el último archivo validado de ese paso no tuvo errores; si falla, explicale al usuario el motivo.',
      inputSchema: z.object({ paso: z.enum(STEP_IDS) }),
      execute: async ({ paso }) => {
        const r = await deps.progress.markComplete(deps.lab, paso);
        if (!r.ok) return { ok: false, mensaje: r.reason };
        return { ok: true, mensaje: `Paso "${getSchema(paso).title}" completo.`, siguiente: stepBrief(nextPendingStep(r.progress)) };
      },
    }),
  };
}
