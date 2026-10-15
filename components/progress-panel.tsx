'use client';

import { CheckIcon, XIcon } from '@/components/icons';
import type { LabProgress } from '@/lib/onboarding/state';
import { progressView, type StepView } from '@/lib/onboarding/steps';

const LABEL: Record<StepView['estado'], string> = {
  pendiente: 'Pendiente',
  con_errores: 'Con errores',
  validado: 'Validado',
  completo: 'Completo',
};

function StatusDot({ estado, current }: { estado: StepView['estado']; current: boolean }) {
  if (estado === 'completo') {
    return (
      <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-green-600 text-white">
        <CheckIcon size={11} strokeWidth={3.5} />
      </span>
    );
  }
  if (estado === 'con_errores') {
    return (
      <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-red-600 text-white">
        <XIcon size={10} strokeWidth={3.5} />
      </span>
    );
  }
  if (estado === 'validado' || current) {
    return <span className="h-[18px] w-[18px] flex-none rounded-full border-[5px] border-blue-200 bg-brand" />;
  }
  return <span className="h-[18px] w-[18px] flex-none rounded-full border-[1.5px] border-zinc-300" />;
}

export function ProgressPanel({ progress }: { progress: LabProgress | null }) {
  if (!progress) return <p className="p-6 text-xs text-zinc-500">Cargando progreso…</p>;
  const data = progressView(progress);

  const groups = new Map<string, StepView[]>();
  for (const p of data.pasos) {
    const key = `${p.categoria} · ${p.categoriaTitulo}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const pct = Math.round((data.completos / data.total) * 100);
  const currentId = data.pasos.find((p) => p.estado !== 'completo')?.id;

  return (
    <div className="p-6 text-sm">
      <h2 className="text-[15px] font-semibold">Progreso de onboarding</h2>
      <div className="mt-2.5 flex items-baseline justify-between text-[13px] text-zinc-600">
        <span>
          <strong className="text-[22px] font-bold text-zinc-950">{data.completos}</strong> de {data.total} pasos completos
        </span>
        <span>{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-6 space-y-5">
        {[...groups.entries()].map(([title, pasos]) => (
          <div key={title}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500">{title}</p>
            <ul className="mt-2 space-y-0.5">
              {pasos.map((p) => {
                const current = p.id === currentId;
                return (
                  <li
                    key={p.id}
                    className={`flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-[13px] ${current ? 'bg-zinc-100' : ''}`}
                    title={p.ultimoArchivo ?? undefined}
                  >
                    <StatusDot estado={p.estado} current={current} />
                    <span className={`flex-1 ${p.estado === 'pendiente' && !current ? 'text-zinc-500' : 'text-zinc-950'} ${current ? 'font-semibold' : ''}`}>
                      {p.titulo}
                      {p.estado === 'con_errores' && p.errores !== null && (
                        <span className="block text-[11px] font-normal text-red-700">{p.errores} errores</span>
                      )}
                    </span>
                    <span className={`text-[11px] text-zinc-500 ${p.estado === 'pendiente' ? 'sr-only' : ''}`}>{LABEL[p.estado]}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
