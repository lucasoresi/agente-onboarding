'use client';

import { useEffect, useState } from 'react';
import type { StepView } from '@/lib/onboarding/steps';

type ProgressResponse = { lab: string; pasos: StepView[]; completos: number; total: number };

const ICON: Record<StepView['estado'], string> = { pendiente: '○', con_errores: '❌', validado: '☑️', completo: '✅' };
const LABEL: Record<StepView['estado'], string> = {
  pendiente: 'Pendiente',
  con_errores: 'Con errores',
  validado: 'Validado',
  completo: 'Completo',
};

export function ProgressPanel({ lab, version }: { lab: string; version: number }) {
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/progress?lab=${encodeURIComponent(lab)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: ProgressResponse) => {
        if (alive) {
          setData(d);
          setFailed(false);
        }
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [lab, version]);

  if (failed) return <p className="p-4 text-xs text-red-700">No se pudo cargar el progreso.</p>;
  if (!data) return <p className="p-4 text-xs text-slate-500">Cargando progreso…</p>;

  const groups = new Map<string, StepView[]>();
  for (const p of data.pasos) {
    const key = `${p.categoria} · ${p.categoriaTitulo}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  return (
    <div className="space-y-4 p-4 text-sm">
      <div>
        <p className="font-semibold">Progreso de onboarding</p>
        <p className="text-xs text-slate-500">
          {data.completos} de {data.total} pasos completos
        </p>
        <div className="mt-2 h-2 rounded bg-slate-200">
          <div className="h-2 rounded bg-emerald-500" style={{ width: `${(data.completos / data.total) * 100}%` }} />
        </div>
      </div>
      {[...groups.entries()].map(([title, pasos]) => (
        <div key={title}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <ul className="space-y-1">
            {pasos.map((p) => (
              <li key={p.id} className="flex items-start gap-2" title={p.ultimoArchivo ?? undefined}>
                <span aria-hidden>{ICON[p.estado]}</span>
                <span className="flex-1">
                  {p.titulo}
                  <span className="sr-only"> — {LABEL[p.estado]}</span>
                  {p.estado === 'con_errores' && p.errores !== null && (
                    <span className="block text-xs text-red-700">{p.errores} errores</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
