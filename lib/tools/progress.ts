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
        'Marca un paso como completo. Solo funciona si el último archivo validado de ese paso no tuvo errores; si falla, explicale al usuario el motivo. Marcar un paso NO carga datos en Optacost.',
      inputSchema: z.object({
        paso: z.enum(STEP_IDS),
        reemplazar: z
          .boolean()
          .optional()
          .describe('Solo si el paso ya estaba completo y el usuario confirmó que el archivo nuevo reemplace al anterior.'),
      }),
      execute: async ({ paso, reemplazar }) => {
        const r = await deps.progress.markComplete(deps.lab, paso, { replace: reemplazar });
        if (!r.ok) return { ok: false, mensaje: r.reason };
        const siguiente = stepBrief(nextPendingStep(r.progress));
        const titulo = getSchema(paso).title;
        const base = r.replaced ? `Paso "${titulo}" completo: el archivo nuevo reemplazó a ${r.replaced}.` : `Paso "${titulo}" completo.`;
        if (siguiente) return { ok: true, mensaje: base, siguiente };
        return {
          ok: true,
          todosCompletos: true,
          siguiente: null,
          mensaje: `${base} Los 14 pasos quedaron validados. Validar no es cargar: todavía no se cargó nada en Optacost; el equipo de Optacost va a cargar los datos a partir de estos archivos.`,
        };
      },
    }),
  };
}
