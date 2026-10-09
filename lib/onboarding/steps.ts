import { SCHEMAS } from '@/lib/validation/schemas';
import type { Category, StepId } from '@/lib/validation/types';
import type { LabProgress, StepStatus } from './state';

export const CATEGORY_TITLES: Record<Category, string> = {
  '01': 'Estructura y equipo',
  '02': 'Operación del laboratorio',
  '03': 'Información financiera',
  '04': 'Estructura comercial',
};

export type StepInfo = {
  id: StepId;
  title: string;
  category: Category;
  categoryTitle: string;
  templateFile: string;
  requiredColumns: string[];
  optionalColumns: string[];
  dynamicHint?: string;
};

export const STEPS: StepInfo[] = SCHEMAS.map((s) => ({
  id: s.id,
  title: s.title,
  category: s.category,
  categoryTitle: CATEGORY_TITLES[s.category],
  templateFile: s.templateFile,
  requiredColumns: s.columns.filter((c) => c.level === 'required').map((c) => c.label),
  optionalColumns: s.columns.filter((c) => c.level !== 'required').map((c) => c.label),
  dynamicHint: s.dynamic?.missingMessage,
}));

export type StepView = {
  id: StepId;
  titulo: string;
  categoria: Category;
  categoriaTitulo: string;
  estado: StepStatus;
  ultimoArchivo: string | null;
  errores: number | null;
};

export function progressView(p: LabProgress): { lab: string; pasos: StepView[]; completos: number; total: number } {
  const pasos = STEPS.map((s) => ({
    id: s.id,
    titulo: s.title,
    categoria: s.category,
    categoriaTitulo: s.categoryTitle,
    estado: p.steps[s.id].status,
    ultimoArchivo: p.steps[s.id].lastFile ?? null,
    errores: p.steps[s.id].errors ?? null,
  }));
  return { lab: p.lab, pasos, completos: pasos.filter((x) => x.estado === 'completo').length, total: STEPS.length };
}

export function nextPendingStep(p: LabProgress): StepInfo | null {
  return STEPS.find((s) => p.steps[s.id].status !== 'completo') ?? null;
}
