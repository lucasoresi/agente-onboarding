import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getSchema } from '@/lib/validation/schemas';
import { STEP_IDS, type CatalogName, type StepId } from '@/lib/validation/types';
import type { Catalogs } from '@/lib/validation/validate';
import { LAB_ID } from './lab';

export type StepStatus = 'pendiente' | 'con_errores' | 'validado' | 'completo';

export type StepState = {
  status: StepStatus;
  lastFile?: string;
  validatedAt?: string;
  errors?: number;
  warnings?: number;
};

export type LabProgress = {
  lab: string;
  steps: Record<StepId, StepState>;
  catalogs: Partial<Record<CatalogName, string[]>>;
};

export type ValidationSummary = { fileName: string; ok: boolean; errorCount: number; warningCount: number };

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

export class ProgressStore {
  private queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly dir: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private file(lab: string) {
    assertLab(lab);
    return join(this.dir, `${lab}.json`);
  }

  async load(lab: string): Promise<LabProgress> {
    const file = this.file(lab);
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyProgress(lab);
      throw e;
    }
    try {
      const raw = JSON.parse(text) as Partial<LabProgress>;
      const base = emptyProgress(lab);
      return { lab, steps: { ...base.steps, ...raw.steps }, catalogs: raw.catalogs ?? {} };
    } catch {
      const backup = `${file}.corrupto-${this.now().getTime()}`;
      await rename(file, backup);
      console.warn(`[onboarding] progreso corrupto de "${lab}", respaldado en ${backup}`);
      return emptyProgress(lab);
    }
  }

  private async save(p: LabProgress) {
    await mkdir(this.dir, { recursive: true });
    const file = this.file(p.lab);
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(p, null, 2));
    await rename(tmp, file);
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

  recordValidation(
    lab: string,
    step: StepId,
    r: ValidationSummary,
    catalog?: { name: CatalogName; codes: string[] },
  ): Promise<LabProgress> {
    return this.update(lab, (p) => {
      const prev = p.steps[step];
      const status: StepStatus = !r.ok ? 'con_errores' : prev.status === 'completo' ? 'completo' : 'validado';
      p.steps[step] = {
        status,
        lastFile: r.fileName,
        validatedAt: this.now().toISOString(),
        errors: r.errorCount,
        warnings: r.warningCount,
      };
      if (r.ok && catalog) p.catalogs[catalog.name] = catalog.codes;
      return p;
    });
  }

  markComplete(lab: string, step: StepId): Promise<{ ok: true; progress: LabProgress } | { ok: false; reason: string }> {
    return this.update(lab, (p) => {
      const s = p.steps[step];
      const title = getSchema(step).title;
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
    for (const [name, codes] of Object.entries(p.catalogs) as [CatalogName, string[]][]) out[name] = new Set(codes);
    return out;
  }
}

const g = globalThis as unknown as { __onboardingProgressStore?: ProgressStore };

export function getProgressStore(): ProgressStore {
  return (g.__onboardingProgressStore ??= new ProgressStore(
    process.env.ONBOARDING_DIR ?? join(process.cwd(), '.onboarding'),
  ));
}
