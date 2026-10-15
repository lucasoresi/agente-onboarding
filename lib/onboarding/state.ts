import { normalizeCode } from '@/lib/validation/normalize';
import { getSchema } from '@/lib/validation/schemas';
import { STEP_IDS, type CatalogName, type StepId } from '@/lib/validation/types';
import type { Catalogs } from '@/lib/validation/validate';
import { LAB_ID } from './lab';

export type StepStatus = 'pendiente' | 'con_errores' | 'validado' | 'completo';

export type CatalogUpdate = { name: CatalogName; codes: string[] };

export type StepState = {
  status: StepStatus;
  lastFile?: string;
  validatedAt?: string;
  errors?: number;
  warnings?: number;
  rows?: number;
  /** Archivo válido que reemplazaría al de un paso completo; se aplica solo si el usuario lo confirma. */
  pending?: { fileName: string; validatedAt: string; warnings: number; rows?: number; catalog?: CatalogUpdate };
  /** Último intento con errores sobre un paso que ya estaba completo (no lo reemplaza). */
  lastAttempt?: { fileName: string; validatedAt: string; errors: number };
};

export type LabProgress = {
  lab: string;
  steps: Record<StepId, StepState>;
  catalogs: Partial<Record<CatalogName, string[]>>;
};

export type ValidationSummary = { fileName: string; ok: boolean; errorCount: number; warningCount: number; rows?: number };

export function emptyProgress(lab: string): LabProgress {
  return {
    lab,
    steps: Object.fromEntries(STEP_IDS.map((id) => [id, { status: 'pendiente' }])) as Record<StepId, StepState>,
    catalogs: {},
  };
}

function assertLab(lab: string) {
  if (!LAB_ID.test(lab)) throw new Error(`Identificador de laboratorio inválido: "${lab}"`);
}

const STATUSES: StepStatus[] = ['pendiente', 'con_errores', 'validado', 'completo'];
const CATALOG_NAMES: CatalogName[] = ['practicas', 'insumos', 'obras_sociales', 'competencia'];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Convierte lo que guardó el navegador (no confiable: puede faltar, estar viejo o roto) en un progreso válido.
 * Ignora pasos desconocidos o con estado inválido y catálogos que no sean listas de textos.
 */
export function normalizeProgress(raw: unknown, lab: string): LabProgress {
  const base = emptyProgress(lab);
  if (!isObject(raw) || (raw.lab !== undefined && raw.lab !== lab)) return base;
  if (isObject(raw.steps)) {
    for (const id of STEP_IDS) {
      const st = raw.steps[id];
      if (isObject(st) && STATUSES.includes(st.status as StepStatus)) base.steps[id] = st as StepState;
    }
  }
  if (isObject(raw.catalogs)) {
    for (const [name, codes] of Object.entries(raw.catalogs)) {
      if (CATALOG_NAMES.includes(name as CatalogName) && Array.isArray(codes) && codes.every((c) => typeof c === 'string')) base.catalogs[name as CatalogName] = codes;
    }
  }
  return base;
}

/**
 * Progreso de los laboratorios en memoria. El servidor no guarda nada: en cada mensaje el navegador manda
 * el progreso que tiene guardado, las tools lo modifican acá y el resultado vuelve al navegador.
 */
export class ProgressStore {
  private queues = new Map<string, Promise<unknown>>();
  private data = new Map<string, LabProgress>();
  private readonly now: () => Date;

  constructor(opts: { initial?: LabProgress[]; now?: () => Date } = {}) {
    this.now = opts.now ?? (() => new Date());
    for (const p of opts.initial ?? []) this.data.set(p.lab, structuredClone(p));
  }

  async load(lab: string): Promise<LabProgress> {
    return this.snapshot(lab);
  }

  /** Copia del progreso actual, para devolverla al navegador. */
  snapshot(lab: string): LabProgress {
    assertLab(lab);
    const p = this.data.get(lab);
    return p ? structuredClone(p) : emptyProgress(lab);
  }

  private async save(p: LabProgress) {
    this.data.set(p.lab, structuredClone(p));
  }

  private update<T>(lab: string, fn: (p: LabProgress) => T): Promise<T> {
    const prev = this.queues.get(lab) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        const p = await this.load(lab);
        const result = fn(p);
        await this.save(p);
        return result;
      });
    this.queues.set(lab, next);
    return next;
  }

  /**
   * Registra el resultado de una validación. Un paso completo nunca se pierde por una validación nueva:
   * con errores queda como intento fallido; sin errores queda pendiente hasta que el usuario confirme el reemplazo.
   */
  recordValidation(lab: string, step: StepId, r: ValidationSummary, catalog?: CatalogUpdate): Promise<LabProgress> {
    return this.update(lab, (p) => {
      const prev = p.steps[step];
      const validatedAt = this.now().toISOString();
      if (prev.status === 'completo') {
        if (r.ok) {
          p.steps[step] = { ...prev, pending: { fileName: r.fileName, validatedAt, warnings: r.warningCount, rows: r.rows, catalog } };
        } else {
          p.steps[step] = { ...prev, lastAttempt: { fileName: r.fileName, validatedAt, errors: r.errorCount } };
        }
        return p;
      }
      p.steps[step] = {
        status: r.ok ? 'validado' : 'con_errores',
        lastFile: r.fileName,
        validatedAt,
        errors: r.errorCount,
        warnings: r.warningCount,
        rows: r.rows,
      };
      if (r.ok && catalog) p.catalogs[catalog.name] = catalog.codes;
      return p;
    });
  }

  markComplete(
    lab: string,
    step: StepId,
    opts: { replace?: boolean } = {},
  ): Promise<{ ok: true; progress: LabProgress; replaced?: string } | { ok: false; reason: string }> {
    return this.update(lab, (p) => {
      const s = p.steps[step];
      const title = getSchema(step).title;
      if (s.status === 'completo') {
        if (!s.pending) return { ok: true as const, progress: p };
        if (!opts.replace) {
          return {
            ok: false as const,
            reason: `${title} ya está completo con ${s.lastFile}. El archivo nuevo (${s.pending.fileName}) lo reemplazaría: confirmalo con el usuario y volvé a llamar con reemplazar=true.`,
          };
        }
        const { pending } = s;
        p.steps[step] = {
          status: 'completo',
          lastFile: pending.fileName,
          validatedAt: pending.validatedAt,
          errors: 0,
          warnings: pending.warnings,
          rows: pending.rows,
        };
        if (pending.catalog) p.catalogs[pending.catalog.name] = pending.catalog.codes;
        return { ok: true as const, progress: p, replaced: s.lastFile };
      }
      if (s.status === 'con_errores') {
        return {
          ok: false as const,
          reason: `El último archivo de ${title} (${s.lastFile}) tiene ${s.errors} errores: hay que corregirlos y volver a validar.`,
        };
      }
      if (s.status === 'pendiente') {
        return { ok: false as const, reason: `Todavía no se validó ningún archivo de ${title}.` };
      }
      p.steps[step] = { ...s, status: 'completo' };
      return { ok: true as const, progress: p };
    });
  }

  async catalogs(lab: string): Promise<Catalogs> {
    const p = await this.load(lab);
    const out: Catalogs = {};
    for (const [name, codes] of Object.entries(p.catalogs) as [CatalogName, string[]][]) out[name] = new Set(codes.map((c) => normalizeCode(c)));
    return out;
  }
}
