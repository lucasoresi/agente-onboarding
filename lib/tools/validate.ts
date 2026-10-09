import { tool } from 'ai';
import { z } from 'zod';
import type { FileStore } from '@/lib/files/store';
import type { ProgressStore } from '@/lib/onboarding/state';
import { detectSchema } from '@/lib/validation/detect';
import { STEP_IDS, type StepId, type ValidationReport } from '@/lib/validation/types';
import { extractCatalog, validateFile } from '@/lib/validation/validate';

export const MODEL_MAX_ERRORS = 20;
export const MODEL_MAX_WARNINGS = 10;

export type ValidateOutput =
  | { status: 'validado'; report: ValidationReport }
  | { status: 'ambiguo'; candidatos: { id: StepId; titulo: string }[]; mensaje: string }
  | { status: 'desconocido'; mensaje: string }
  | { status: 'expirado'; mensaje: string };

export type ToolDeps = { files: FileStore; progress: ProgressStore; lab: string };

export async function runValidation(deps: ToolDeps, input: { fileId: string; tipo?: StepId }): Promise<ValidateOutput> {
  const file = deps.files.get(input.fileId);
  if (!file) {
    return {
      status: 'expirado',
      mensaje: 'No encuentro ese archivo: puede haber expirado (se guardan 1 hora). Pedile al usuario que lo vuelva a adjuntar.',
    };
  }
  const detection = detectSchema(file, input.tipo);
  if (detection.kind === 'ambiguo') {
    return {
      status: 'ambiguo',
      candidatos: detection.candidates.map((s) => ({ id: s.id, titulo: s.title })),
      mensaje: 'No pude determinar qué datos tiene el archivo. Preguntale al usuario cuál de estos es y volvé a llamar con "tipo".',
    };
  }
  if (detection.kind === 'desconocido') {
    return {
      status: 'desconocido',
      mensaje:
        'Los encabezados no coinciden con ninguna plantilla de Optacost. Preguntale al usuario qué datos contiene y volvé a llamar con "tipo", o pedile que use la plantilla correspondiente.',
    };
  }
  const schema = detection.schema;
  const report = validateFile(file, schema, await deps.progress.catalogs(deps.lab));
  const codes = report.ok ? extractCatalog(file, schema) : undefined;
  await deps.progress.recordValidation(
    deps.lab,
    schema.id,
    report,
    codes && schema.providesCatalog ? { name: schema.providesCatalog.catalog, codes } : undefined,
  );
  return { status: 'validado', report };
}

export function summarizeForModel(out: ValidateOutput) {
  if (out.status !== 'validado') return out;
  const r = out.report;
  return {
    status: 'validado',
    archivo: r.fileName,
    tipo: r.schemaId,
    ok: r.ok,
    filas: r.rows,
    totalErrores: r.errorCount,
    totalAdvertencias: r.warningCount,
    errores: r.errors.slice(0, MODEL_MAX_ERRORS),
    advertencias: r.warnings.slice(0, MODEL_MAX_WARNINGS),
    columnasDinamicas: r.dynamicColumns,
  };
}

export function createValidateTool(deps: ToolDeps) {
  return tool({
    description:
      'Valida un archivo CSV/Excel adjuntado por el usuario contra la plantilla de Optacost. Usala SIEMPRE que el usuario adjunte o pida validar un archivo; nunca inventes el resultado.',
    inputSchema: z.object({
      fileId: z.string().describe('El fileId que aparece en el mensaje del usuario, por ejemplo f_ab12cd34ef56'),
      tipo: z
        .enum(STEP_IDS)
        .optional()
        .describe('Tipo de datos. Solo si el usuario lo indicó o si una validación anterior respondió "ambiguo" o "desconocido".'),
    }),
    execute: (input) => runValidation(deps, input),
    // La UI recibe el reporte completo; el modelo, solo un resumen truncado.
    toModelOutput: ({ output }) => ({ type: 'json', value: JSON.parse(JSON.stringify(summarizeForModel(output))) }),
  });
}
