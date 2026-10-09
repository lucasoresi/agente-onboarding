import type { ValidateOutput } from '@/lib/tools/validate';
import type { Issue } from '@/lib/validation/types';

const SHOWN = 50;

function IssueList({ title, issues, total, tone, open = false }: { title: string; issues: Issue[]; total: number; tone: string; open?: boolean }) {
  if (total === 0) return null;
  return (
    <details className="mt-2" open={open}>
      <summary className="cursor-pointer font-medium">
        {title} ({total})
      </summary>
      <ul className={`mt-1 list-disc space-y-0.5 pl-5 ${tone}`}>
        {issues.slice(0, SHOWN).map((issue, k) => (
          <li key={k}>{issue.message}</li>
        ))}
      </ul>
      {total > SHOWN && <p className="mt-1 text-slate-500">…y {total - SHOWN} más. Corregí estos y volvé a validar.</p>}
    </details>
  );
}

export function ValidationReportCard({ output }: { output: ValidateOutput }) {
  if (output.status !== 'validado') {
    return <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">{output.mensaje}</div>;
  }
  const r = output.report;
  return (
    <div className={`rounded-lg border p-3 text-xs ${r.ok ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'}`}>
      <p className="font-semibold">
        {r.ok ? '✅' : '❌'} {r.schemaTitle} · {r.fileName}
      </p>
      <p className="mt-1 text-slate-600">
        Hoja «{r.sheetName}» · {r.rows} filas · {r.errorCount} errores · {r.warningCount} advertencias
      </p>
      {r.dynamicColumns?.length ? <p className="mt-1 text-slate-600">Columnas detectadas: {r.dynamicColumns.join(', ')}</p> : null}
      <IssueList title="Errores" issues={r.errors} total={r.errorCount} tone="text-red-800" open />
      <IssueList title="Advertencias" issues={r.warnings} total={r.warningCount} tone="text-amber-800" />
    </div>
  );
}
