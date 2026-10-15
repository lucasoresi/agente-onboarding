import type { ReactNode } from 'react';
import { AlertIcon, CheckIcon, XIcon } from '@/components/icons';
import type { ValidateOutput } from '@/lib/tools/validate';
import type { Issue } from '@/lib/validation/types';

const SHOWN = 50;

function IssueList({ title, issues, total, tone, open = false }: { title: string; issues: Issue[]; total: number; tone: string; open?: boolean }) {
  if (total === 0) return null;
  return (
    <details className="border-t border-zinc-100 px-4 py-3" open={open}>
      <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
        {title} ({total})
      </summary>
      <ul className={`mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed ${tone}`}>
        {issues.slice(0, SHOWN).map((issue, k) => (
          <li key={k}>{issue.message}</li>
        ))}
      </ul>
      {total > SHOWN && <p className="mt-2 text-xs text-zinc-500">…y {total - SHOWN} más. Corregí estos y volvé a validar.</p>}
    </details>
  );
}

function Pill({ children, tone }: { children: ReactNode; tone: string }) {
  return <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${tone}`}>{children}</span>;
}

export function ValidationReportCard({ output }: { output: ValidateOutput }) {
  if (output.status !== 'validado') {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
        <AlertIcon size={16} className="flex-none" />
        {output.aviso}
      </div>
    );
  }
  const r = output.report;
  const hasIssues = r.errorCount > 0 || r.warningCount > 0;
  return (
    <section className={`overflow-hidden rounded-xl border ${r.ok ? 'border-green-200 bg-green-50' : 'border-zinc-200 bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2.5">
          {r.ok ? (
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-green-600 text-white">
              <CheckIcon size={14} />
            </span>
          ) : (
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-red-100 text-red-700">
              <XIcon size={14} />
            </span>
          )}
          <div>
            <p className="text-sm font-semibold">{r.schemaTitle}</p>
            <p className={`text-xs ${r.ok ? 'text-green-900/70' : 'text-zinc-500'}`}>
              {r.fileName} · Hoja «{r.sheetName}»
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill tone={r.ok ? 'bg-white text-zinc-700' : 'bg-zinc-100 text-zinc-700'}>{r.rows} filas</Pill>
          <Pill tone={r.errorCount ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-800'}>{r.errorCount} errores</Pill>
          <Pill tone={r.warningCount ? 'bg-amber-100 text-amber-800' : r.ok ? 'bg-white text-zinc-700' : 'bg-zinc-100 text-zinc-700'}>
            {r.warningCount} advertencias
          </Pill>
        </div>
      </div>
      {r.dynamicColumns?.length ? (
        <p className={`px-4 pb-3 text-xs ${r.ok ? 'text-green-900/70' : 'text-zinc-500'}`}>Columnas detectadas: {r.dynamicColumns.join(', ')}</p>
      ) : null}
      {hasIssues && (
        <div className="bg-white">
          <IssueList title="Errores" issues={r.errors} total={r.errorCount} tone="text-red-800" open />
          <IssueList title="Advertencias" issues={r.warnings} total={r.warningCount} tone="text-amber-800" />
        </div>
      )}
    </section>
  );
}
