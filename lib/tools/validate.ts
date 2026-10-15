import { tool } from 'ai';
import { z } from 'zod';
import type { FileStore } from '@/lib/files/store';
import type { ProgressStore } from '@/lib/onboarding/state';
import { detectSchema } from '@/lib/validation/detect';
import { STEP_IDS, type StepId, type ValidationReport } from '@/lib/validation/types';
import { normalizeCode } from '@/lib/validation/normalize';
import { extractCatalogCodes, validateFile } from '@/lib/validation/validate';

export const MODEL_MAX_ERRORS = 20;
export const MODEL_MAX_WARNINGS = 10;

/** Si el paso ya estaba completo, el archivo nuevo no lo reemplaza solo (ver ProgressStore.recordValidation). */
export type PasoCompleto = { archivo: string; filas?: number; codigosQueSeQuitan?: string[] };

/** `mensaje` es la instrucción para el modelo; `aviso` es lo que ve el usuario en la interfaz. */
export type ValidateOutput =
  | { status: 'validado'; report: ValidationReport; pasoCompleto?: PasoCompleto; tipoCorregido?: TipoCorregido }
  | { status: 'ambiguo'; candidatos: { id: StepId; titulo: string }[]; mensaje: string; aviso: string }
  | { status: 'desconocido'; mensaje: string; aviso: string }
  | { status: 'expirado'; mensaje: string; aviso: string };

/** El modelo pidió validar como un paso, pero los encabezados son claramente de otro. */
export type TipoCorregido = { pedido: StepId; detectado: StepId };

export type ToolDeps = { files: FileStore; progress: ProgressStore; lab: string };

export async function runValidation(deps: ToolDeps, input: { fileId: string; tipo?: StepId }): Promise<ValidateOutput> {
  const file = deps.files.get(input.fileId);
  if (!file) {
    return {
      status: 'expirado',
      mensaje: 'No tengo ese archivo: solo está disponible el último archivo adjuntado en esta conversación. Pedile al usuario que lo vuelva a adjuntar.',
      aviso: 'Ese archivo ya no está disponible. Volvé a adjuntarlo.',
    };
  }
  // "tipo" solo decide cuando la detección automática no es concluyente: el modelo a veces lo manda con el
  // paso que espera ("sedes") aunque el archivo sea claramente de otro, y eso marcaba con errores el paso equivocado.
  const auto = detectSchema(file);
  const detection = auto.kind === 'ok' || !input.tipo ? auto : detectSchema(file, input.tipo);
  const tipoCorregido: TipoCorregido | undefined =
    input.tipo && auto.kind === 'ok' && auto.schema.id !== input.tipo ? { pedido: input.tipo, detectado: auto.schema.id } : undefined;
  if (detection.kind === 'ambiguo') {
    return {
      status: 'ambiguo',
      candidatos: detection.candidates.map((s) => ({ id: s.id, titulo: s.title })),
      mensaje: 'No pude determinar qué datos tiene el archivo. Preguntale al usuario cuál de estos es y volvé a llamar con "tipo".',
      aviso: `No pude determinar qué datos tiene este archivo. Puede ser: ${detection.candidates.map((s) => s.title).join(' o ')}.`,
    };
  }
  if (detection.kind === 'desconocido') {
    return {
      status: 'desconocido',
      mensaje:
        'Los encabezados no coinciden con ninguna plantilla de Optacost. Preguntale al usuario qué datos contiene y volvé a llamar con "tipo", o pedile que use la plantilla correspondiente.',
      aviso: 'Los encabezados de este archivo no coinciden con ninguna plantilla de Optacost.',
    };
  }
  const schema = detection.schema;
  const before = await deps.progress.load(deps.lab);
  const report = validateFile(file, schema, await deps.progress.catalogs(deps.lab));
  const codes = report.ok ? extractCatalogCodes(file, schema) : undefined;
  const catalog = codes && schema.providesCatalog ? { name: schema.providesCatalog.catalog, codes } : undefined;
  await deps.progress.recordValidation(deps.lab, schema.id, report, catalog);

  const prev = before.steps[schema.id];
  const extra = tipoCorregido ? { tipoCorregido } : {};
  if (prev.status !== 'completo') return { status: 'validado', report, ...extra };
  const pasoCompleto: PasoCompleto = { archivo: prev.lastFile ?? '', filas: prev.rows };
  const oldCodes = catalog ? before.catalogs[catalog.name] : undefined;
  if (catalog && oldCodes) {
    const nuevos = new Set(catalog.codes.map((c) => normalizeCode(c)));
    const quitados = oldCodes.filter((c) => !nuevos.has(normalizeCode(c)));
    if (quitados.length) pasoCompleto.codigosQueSeQuitan = quitados;
  }
  return { status: 'validado', report, pasoCompleto, ...extra };
}

const MAX_CODIGOS_QUITADOS = 20;

export function summarizeForModel(out: ValidateOutput) {
  if (out.status !== 'validado') {
    const { aviso: _aviso, ...forModel } = out;
    return forModel;
  }
  const r = out.report;
  const pc = out.pasoCompleto;
  return {
    ...(pc && {
      pasoYaCompleto: {
        archivoActual: pc.archivo,
        filasActuales: pc.filas,
        seReemplaza: false,
        ...(pc.codigosQueSeQuitan && {
          codigosQueSeQuitan: pc.codigosQueSeQuitan.slice(0, MAX_CODIGOS_QUITADOS),
          totalCodigosQueSeQuitan: pc.codigosQueSeQuitan.length,
        }),
      },
    }),
    ...(out.tipoCorregido && { tipoCorregido: out.tipoCorregido }),
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
        .describe('Tipo de datos. Solo si una validación anterior respondió "ambiguo" o "desconocido". No lo mandes para indicar el paso que esperás: el tipo se detecta solo.'),
    }),
    execute: (input) => runValidation(deps, input),
    // La UI recibe el reporte completo; el modelo, solo un resumen truncado.
    toModelOutput: ({ output }) => ({ type: 'json', value: JSON.parse(JSON.stringify(summarizeForModel(output))) }),
  });
}
