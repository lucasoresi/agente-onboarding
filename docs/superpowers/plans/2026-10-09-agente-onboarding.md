# Agente de Onboarding Optacost — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App web local (Next.js) donde un laboratorio adjunta sus CSV/xlsx de onboarding y un agente con Gemini gratuito lo guía paso a paso, valida los archivos con código determinístico y responde dudas con la documentación del MCP de Optacost.

**Architecture:** La lógica pura (`lib/validation`, `lib/onboarding`) lee archivos, aplica 14 esquemas y guarda el progreso en JSON. `lib/tools` la expone como tools de AI SDK, junto a 2 tools del MCP de docs, que entran por allowlist. `app/api/chat` orquesta Gemini con `streamText`, y la UI usa `useChat` con un panel de progreso. El contenido de los archivos nunca llega al modelo: solo un reporte truncado.

**Tech Stack:** Next.js 16.4, React 19.3, TypeScript 6.0, Tailwind 4.3, AI SDK 7 (`ai`, `@ai-sdk/react`, `@ai-sdk/google`, `@ai-sdk/mcp`), zod 4, SheetJS 0.20.3 (CDN), papaparse 5.7, react-markdown 10, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-09-agente-onboarding-design.md`

## Global Constraints

- **Node:** 24 (instalado: v24.19.0). Vitest 5 exige `^22.12 || ^24`.
- **Versiones exactas:** `next@16.4.0`, `react@19.3.0`, `react-dom@19.3.0`, `ai@7.0.135`, `@ai-sdk/google@4.0.93`, `@ai-sdk/react@4.0.138`, `@ai-sdk/mcp@2.0.72`, `zod@4.6.5`, `papaparse@5.7.0`, `xlsx` desde `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (**no** usar `xlsx@0.18.5` de npm: tiene CVEs de prototype pollution/ReDoS y parseamos archivos de terceros), `react-markdown@10.1.0`, `remark-gfm@4.0.1`, dev: `typescript@6.0.3`, `vitest@5.0.3`, `tailwindcss@4.3.3`, `@tailwindcss/postcss@4.3.3`, `@types/react@19.3.0`, `@types/react-dom@19.3.0`, `@types/node@24.19.1`, `@types/papaparse@5.5.2`.
- **AI SDK 7 (no confundir con v5/v6):** se usa `instructions` (no `system`), `isStepCount` (no `stepCountIs`), `toUIMessageStream({ stream: result.stream })` + `createUIMessageStreamResponse` (no `result.toUIMessageStreamResponse()`), `createGoogle` de `@ai-sdk/google`, `createMCPClient` de `@ai-sdk/mcp`, `MockLanguageModelV4` de `ai/test` y `onEnd` (no `onFinish`) en `streamText`.
- **LLM:** solo Gemini (`GEMINI_API_KEY`, `GEMINI_MODEL`, opcional `GEMINI_FALLBACK_MODEL`). No instalar otros providers.
- **Privacidad:** el contenido de los archivos subidos nunca se manda al modelo, que solo recibe `summarizeForModel(...)`. Las API keys nunca se loguean ni se imprimen.
- **MCP:** URL `https://www.optacost.com/docs/mcp`. Solo se exponen `search_optacost` y `query_docs_filesystem_optacost`; `submit_feedback` **no**.
- **Drive "Optacost — Onboarding Labmedicina":** solo lectura, nunca modificar.
- **Límites:** archivo ≤ 10 MB, extensiones `.csv`/`.xlsx`/`.xls`, ≤ 50.000 filas, archivos en memoria con TTL de 1 h, reporte al modelo con ≤ 20 errores y ≤ 10 advertencias, `isStepCount(6)`.
- **Textos de UI y mensajes:** español rioplatense.
- **Estilo:** comillas simples, punto y coma, 2 espacios (igual que el dashboard).
- **Commits:** terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Se trabaja en la rama `feat/agente-onboarding`.

## Review Focus

1. **Encabezado que no está en la fila 1** (planilla con título o filas vacías arriba): se espera que el validador encuentre la fila de encabezados entre las primeras 10 y reporte los números de fila reales. Test en Task 5.
2. **Códigos numéricos vs. texto con ceros a la izquierda** (`123` en Excel vs `"0123"` en otro archivo): se espera que la comparación contra el catálogo de prácticas o insumos no genere advertencias falsas. Test en Task 6.
3. **Duplicados que difieren solo en mayúsculas, tildes o espacios** (`Ana@Lab.com` vs `ana@lab.com `): se espera que se reporten como duplicados. Test en Task 6.
4. **Excel cuya primera hoja es "Instrucciones" y la de datos tiene otro nombre** ("Hoja1"): se espera que se valide la hoja de datos, no la de instrucciones. Test en Task 6.
5. **Archivo de progreso `.onboarding/<lab>.json` corrupto** (por edición manual o un corte a mitad de escritura): se espera que la app no se rompa, que renombre el archivo corrupto y arranque con el progreso vacío. Test en Task 8.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example` | Proyecto |
| `app/layout.tsx`, `app/globals.css`, `app/page.tsx` | Shell y página |
| `app/api/upload/route.ts` | Recibe el archivo, lo parsea y devuelve `fileId` |
| `app/api/progress/route.ts` | Progreso del laboratorio para el panel |
| `app/api/chat/route.ts` | Arma modelo, tools y prompt, y hace el stream |
| `lib/validation/types.ts` | Tipos compartidos y `STEP_IDS` |
| `lib/validation/normalize.ts` | Normalización de texto, números, fechas, enums y nombre de archivo |
| `lib/validation/read.ts` | csv/xlsx → `ParsedFile` |
| `lib/validation/schemas.ts` | Los 14 esquemas |
| `lib/validation/columns.ts` | Fila de encabezado y mapeo de columnas |
| `lib/validation/validate.ts` | Reglas por fila → `ValidationReport`, `extractCatalog` |
| `lib/validation/detect.ts` | Inferencia del tipo de archivo |
| `lib/files/store.ts` | Store en memoria con TTL |
| `lib/onboarding/lab.ts` | `LAB_ID`, `DEFAULT_LAB` (seguro para el cliente) |
| `lib/onboarding/state.ts` | `ProgressStore` (JSON por laboratorio) |
| `lib/onboarding/steps.ts` | Metadatos de pasos, vista del progreso, siguiente paso pendiente |
| `lib/tools/validate.ts` | Tool `validar_archivo` |
| `lib/tools/progress.ts` | Tools `ver_progreso` y `marcar_paso` |
| `lib/tools/mcp.ts` | Conexión al MCP de docs, allowlist, resource |
| `lib/agent/model.ts` | Gemini y fallback ante 429 |
| `lib/agent/prompt.ts` | Instrucciones del sistema |
| `lib/agent/run.ts` | `streamText` → `Response` con mensajes de error amigables |
| `lib/client/upload.ts` | Upload desde el browser y marcador de adjunto |
| `components/chat/chat.tsx`, `components/chat/message-view.tsx`, `components/validation-report.tsx`, `components/progress-panel.tsx` | UI |
| `test/**` | Vitest |

---

### Task 1: Scaffold del proyecto

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`, `.env.local` (no se commitea), `app/layout.tsx`, `app/globals.css`, `app/page.tsx`
- Test: `test/smoke.test.ts`

**Interfaces:**
- Produce: alias `@/` → raíz del repo (en TS y en Vitest), script `npm test` = `vitest run`, script `npm run typecheck` = `tsc --noEmit`.

- [ ] **Step 1: Crear la rama**

```bash
cd /mnt/c/Users/lucas/Desktop/optacost/agente-onboarding
git checkout -b feat/agente-onboarding
```

- [ ] **Step 2: Crear `package.json`**

```json
{
  "name": "agente-onboarding",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 3: Instalar dependencias (versiones exactas)**

```bash
npm i --save-exact next@16.4.0 react@19.3.0 react-dom@19.3.0 ai@7.0.135 @ai-sdk/google@4.0.93 @ai-sdk/react@4.0.138 @ai-sdk/mcp@2.0.72 zod@4.6.5 papaparse@5.7.0 react-markdown@10.1.0 remark-gfm@4.0.1 https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
npm i -D --save-exact typescript@6.0.3 vitest@5.0.3 tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 @types/react@19.3.0 @types/react-dom@19.3.0 @types/node@24.19.1 @types/papaparse@5.5.2
```

Esperado: termina sin errores. `npm ls xlsx` muestra `xlsx@0.20.3`.

- [ ] **Step 4: Archivos de configuración**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
```

`postcss.config.mjs`:

```js
export default { plugins: { '@tailwindcss/postcss': {} } };
```

`vitest.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
```

`.gitignore`:

```
node_modules/
.next/
next-env.d.ts
*.tsbuildinfo
.env*.local
.onboarding/
samples/
```

`.env.example`:

```
GEMINI_API_KEY=
GEMINI_MODEL=gemini-flash-latest
GEMINI_FALLBACK_MODEL=
OPTACOST_MCP_URL=https://www.optacost.com/docs/mcp
```

- [ ] **Step 5: Crear `.env.local` copiando las credenciales del dashboard (sin imprimirlas)**

```bash
grep -E '^GEMINI_(API_KEY|MODEL)=' ../dashboard-copia/optacost/.env > .env.local
printf 'GEMINI_FALLBACK_MODEL=\nOPTACOST_MCP_URL=https://www.optacost.com/docs/mcp\n' >> .env.local
cut -d= -f1 .env.local
```

Esperado: imprime solo los nombres `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `OPTACOST_MCP_URL`. `git status` **no** debe listar `.env.local`.

- [ ] **Step 6: Shell mínimo de la app**

`app/globals.css`:

```css
@import 'tailwindcss';

body {
  background: #f1f5f9;
}

.markdown p {
  margin: 0.4rem 0;
}
.markdown ul {
  list-style: disc;
  padding-left: 1.25rem;
}
.markdown ol {
  list-style: decimal;
  padding-left: 1.25rem;
}
.markdown a {
  color: #1d4ed8;
  text-decoration: underline;
}
.markdown strong {
  font-weight: 600;
}
.markdown code {
  background: #f1f5f9;
  border-radius: 0.25rem;
  padding: 0 0.25rem;
}
.markdown table {
  border-collapse: collapse;
  font-size: 0.75rem;
}
.markdown th,
.markdown td {
  border: 1px solid #cbd5e1;
  padding: 0.15rem 0.4rem;
}
```

`app/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Onboarding Optacost' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

`app/page.tsx` (provisorio; se reemplaza en el Task 12):

```tsx
export default function Page() {
  return <main className="p-8">Agente de onboarding Optacost</main>;
}
```

- [ ] **Step 7: Escribir el smoke test**

`test/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { isStepCount } from 'ai';

describe('dependencias', () => {
  it('cargan xlsx 0.20.x y ai 7', () => {
    expect(XLSX.version.startsWith('0.20.')).toBe(true);
    expect(typeof isStepCount).toBe('function');
  });
});
```

- [ ] **Step 8: Correr tests, typecheck y build**

```bash
npm test && npm run typecheck && npx next build
```

Esperado: 1 test PASS, `tsc` sin errores y build OK. Si `next build` modifica `tsconfig.json` o crea `next-env.d.ts`, aceptarlo.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + AI SDK 7 + Vitest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tipos y normalización

**Files:**
- Create: `lib/validation/types.ts`, `lib/validation/normalize.ts`
- Test: `test/validation/normalize.test.ts`

**Interfaces:**
- Produce (`types.ts`): `Cell`, `Row`, `Sheet`, `ParsedFile`, `STEP_IDS`, `StepId`, `Category`, `Level`, `ColType`, `ColumnSpec`, `DynamicSpec`, `CatalogName`, `Schema`, `RuleId`, `Issue`, `ValidationReport`.
- Produce (`normalize.ts`): `normalizeText(s): string`, `normalizeHeader(s): string`, `isEmpty(v): boolean`, `cellToText(v): string`, `normalizeCode(v): string`, `parseNumber(v, decimalComma): number | null`, `detectDecimalComma(values): boolean`, `parseDate(v): Date | null`, `isEmail(s): boolean`, `parseBoolean(v): boolean | null`, `levenshtein(a, b): number`, `matchEnum(value, allowed): { match?: string; suggestion?: string }`, `checkFileNameConvention(name): boolean`.

- [ ] **Step 1: Crear `lib/validation/types.ts`**

```ts
export type Cell = string | number | boolean | Date | null;

/** Fila no vacía con su número real de fila (1-based, como en Excel). */
export type Row = { line: number; cells: Cell[] };

export type Sheet = { name: string; lines: Row[] };

export type ParsedFile = { fileName: string; sheets: Sheet[] };

export const STEP_IDS = [
  'usuarios',
  'sedes',
  'sectores',
  'practicas',
  'insumos',
  'relaciones_consumo',
  'practicas_compuestas',
  'facturacion',
  'costos_indirectos',
  'convenios',
  'obras_sociales',
  'modulos_obra_social',
  'precios_competencia',
  'matching_codigos',
] as const;
export type StepId = (typeof STEP_IDS)[number];

export type Category = '01' | '02' | '03' | '04';
export type Level = 'required' | 'recommended' | 'optional';
export type ColType = 'text' | 'number' | 'date' | 'email' | 'enum' | 'boolean';

export type ColumnSpec = {
  key: string;
  label: string;
  aliases?: string[];
  level: Level;
  type: ColType;
  enumValues?: string[];
  /** Mínimo inclusive (por ejemplo 0 para "no negativo"). */
  min?: number;
  /** Debe ser estrictamente mayor que este valor. */
  greaterThan?: number;
  unique?: boolean;
};

export type DynamicSpec = {
  /** Se compara contra el encabezado normalizado para detectar marcadores sin reemplazar. */
  placeholder: RegExp;
  min: number;
  /** La primera columna dinámica es obligatoria en cada fila. */
  firstRequired: boolean;
  missingMessage: string;
  replaceHint: string;
};

export type CatalogName = 'practicas' | 'insumos';

export type Schema = {
  id: StepId;
  title: string;
  category: Category;
  sheetNames: string[];
  /** Claves normalizadas (sin tildes, espacios ni símbolos) para reconocer el nombre del archivo. */
  fileNameKeys: string[];
  templateFile: string;
  columns: ColumnSpec[];
  dynamic?: DynamicSpec;
  uniquePairs?: [string, string][];
  distinctPair?: [string, string];
  catalogRefs?: { column: string; catalog: CatalogName }[];
  providesCatalog?: { catalog: CatalogName; column: string };
};

export type RuleId =
  | 'archivo_vacio'
  | 'columna_faltante'
  | 'columna_recomendada_faltante'
  | 'columna_desconocida'
  | 'celda_vacia'
  | 'tipo_invalido'
  | 'fuera_de_rango'
  | 'valor_no_permitido'
  | 'duplicado'
  | 'placeholder_sin_reemplazar'
  | 'sin_columnas_dinamicas'
  | 'fila_de_ejemplo'
  | 'nombre_archivo'
  | 'codigo_no_en_catalogo'
  | 'catalogo_no_verificado';

export type Issue = {
  rule: RuleId;
  message: string;
  row?: number;
  column?: string;
  value?: string;
  suggestion?: string;
};

export type ValidationReport = {
  fileName: string;
  schemaId: StepId;
  schemaTitle: string;
  sheetName: string;
  ok: boolean;
  rows: number;
  errorCount: number;
  warningCount: number;
  /** Como máximo MAX_ISSUES; el total real está en errorCount. */
  errors: Issue[];
  warnings: Issue[];
  dynamicColumns?: string[];
};
```

- [ ] **Step 2: Escribir los tests que fallan**

`test/validation/normalize.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  cellToText,
  checkFileNameConvention,
  detectDecimalComma,
  isEmail,
  isEmpty,
  matchEnum,
  normalizeCode,
  normalizeHeader,
  parseBoolean,
  parseDate,
  parseNumber,
} from '@/lib/validation/normalize';

describe('normalizeHeader', () => {
  it('ignora mayúsculas, tildes, espacios dobles y puntuación final', () => {
    expect(normalizeHeader('  Código   de PRÁCTICA: ')).toBe('codigo de practica');
    expect(normalizeHeader('Email*')).toBe('email');
  });
});

describe('isEmpty / cellToText', () => {
  it('trata null, vacío y espacios como vacío', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty('   ')).toBe(true);
    expect(isEmpty(0)).toBe(false);
  });
  it('convierte fechas a ISO y números a texto', () => {
    expect(cellToText(new Date(Date.UTC(2026, 6, 15)))).toBe('2026-07-15');
    expect(cellToText(123)).toBe('123');
    expect(cellToText('  abc ')).toBe('abc');
  });
});

describe('normalizeCode', () => {
  it('quita ceros a la izquierda en códigos numéricos y normaliza texto', () => {
    expect(normalizeCode('0123')).toBe('123');
    expect(normalizeCode(123)).toBe('123');
    expect(normalizeCode(' HEM-01 ')).toBe('hem-01');
    expect(normalizeCode('0')).toBe('0');
  });
});

describe('parseNumber', () => {
  it.each([
    [1234.56, false, 1234.56],
    ['1234.56', false, 1234.56],
    ['1234,56', false, 1234.56],
    ['1.234,56', false, 1234.56],
    ['$ 1.234,50', false, 1234.5],
    ['1.234.567', false, 1234567],
    ['1,234.56', false, 1234.56],
    ['1.234', true, 1234],
    ['1.234', false, 1.234],
    ['-15', false, -15],
  ] as const)('%s (coma decimal=%s) → %s', (v, dc, expected) => {
    expect(parseNumber(v, dc)).toBeCloseTo(expected);
  });
  it.each(['abc', '12a', '1,2,3', ''])('"%s" → null', (v) => {
    expect(parseNumber(v, false)).toBeNull();
  });
  it('rechaza booleanos y fechas', () => {
    expect(parseNumber(true, false)).toBeNull();
    expect(parseNumber(new Date(), false)).toBeNull();
  });
});

describe('detectDecimalComma', () => {
  it('detecta coma decimal si algún valor la usa', () => {
    expect(detectDecimalComma(['10,5', 3, null])).toBe(true);
    expect(detectDecimalComma(['$ 1.234,50'])).toBe(true);
    expect(detectDecimalComma(['1.234', '12', 1.5])).toBe(false);
  });
});

describe('parseDate', () => {
  const iso = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
  it.each([
    ['15/07/2026', '2026-07-15'],
    ['15-07-2026', '2026-07-15'],
    ['2026-07-15', '2026-07-15'],
    ['5/7/2026', '2026-07-05'],
  ])('%s → %s', (v, expected) => {
    expect(iso(parseDate(v))).toBe(expected);
  });
  it('acepta serial de Excel y objetos Date', () => {
    expect(iso(parseDate(46218))).toBe('2026-07-15');
    expect(iso(parseDate(new Date(Date.UTC(2026, 0, 2))))).toBe('2026-01-02');
  });
  it.each(['31/02/2026', 'ayer', '2026/15/01', ''])('"%s" → null', (v) => {
    expect(parseDate(v)).toBeNull();
  });
});

describe('isEmail / parseBoolean', () => {
  it('valida emails', () => {
    expect(isEmail('ana@lab.com')).toBe(true);
    expect(isEmail('ana@lab')).toBe(false);
    expect(isEmail('ana lab@x.com')).toBe(false);
  });
  it('interpreta sí/no', () => {
    expect(parseBoolean('Sí')).toBe(true);
    expect(parseBoolean('SI')).toBe(true);
    expect(parseBoolean(1 as unknown as string)).toBe(true);
    expect(parseBoolean('no')).toBe(false);
    expect(parseBoolean(false)).toBe(false);
    expect(parseBoolean('quizás')).toBeNull();
  });
});

describe('matchEnum', () => {
  const roles = ['Administrador', 'Editor', 'Solo lectura'];
  it('coincide ignorando mayúsculas y tildes', () => {
    expect(matchEnum('administrador', roles)).toEqual({ match: 'Administrador' });
    expect(matchEnum('SOLO LECTURA', roles)).toEqual({ match: 'Solo lectura' });
    expect(matchEnum('Derivacion', ['Derivación', 'Especial'])).toEqual({ match: 'Derivación' });
  });
  it('sugiere el valor más parecido', () => {
    expect(matchEnum('Admin', roles)).toEqual({ suggestion: 'Administrador' });
    expect(matchEnum('lectura', roles)).toEqual({ suggestion: 'Solo lectura' });
    expect(matchEnum('Especiall', ['Derivación', 'Especial'])).toEqual({ suggestion: 'Especial' });
  });
  it('sin sugerencia si no se parece a nada', () => {
    expect(matchEnum('Gerente', roles)).toEqual({});
  });
});

describe('checkFileNameConvention', () => {
  it('acepta AAAA-MM-DD_Nombre.ext', () => {
    expect(checkFileNameConvention('2026-07-15_Usuarios.xlsx')).toBe(true);
    expect(checkFileNameConvention('2026-07-15_Usuarios.CSV')).toBe(true);
  });
  it('rechaza otros nombres', () => {
    expect(checkFileNameConvention('Usuarios.xlsx')).toBe(false);
    expect(checkFileNameConvention('15-07-2026_Usuarios.xlsx')).toBe(false);
  });
});
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `npx vitest run test/validation/normalize.test.ts`
Esperado: FAIL, "Failed to resolve import '@/lib/validation/normalize'".

- [ ] **Step 4: Implementar `lib/validation/normalize.ts`**

```ts
import type { Cell } from './types';

export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeHeader(s: string): string {
  return normalizeText(s).replace(/[\s:.*]+$/, '').trim();
}

export function isEmpty(v: Cell | undefined): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

export function cellToText(v: Cell | undefined): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  return String(v).trim();
}

/** Códigos comparables: sin mayúsculas/tildes y sin ceros a la izquierda si son numéricos. */
export function normalizeCode(v: Cell | undefined): string {
  const t = normalizeText(cellToText(v));
  return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, '') : t;
}

export function parseNumber(v: Cell | undefined, decimalComma: boolean): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.replace(/[$\s]/g, '');
  if (s === '') return null;
  let m: string | null = null;
  if (/^-?\d+$/.test(s)) m = s;
  else if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) m = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(s)) m = s.replace(/,/g, '');
  else if (/^-?\d+,\d+$/.test(s)) m = s.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(s)) m = s.replace(/\./g, '');
  else if (/^-?\d{1,3}\.\d{3}$/.test(s)) m = decimalComma ? s.replace('.', '') : s;
  else if (/^-?\d+\.\d+$/.test(s)) m = s;
  else if (/^-?\d{1,3}(,\d{3}){2,}$/.test(s)) m = s.replace(/,/g, '');
  return m === null ? null : Number(m);
}

export function detectDecimalComma(values: (Cell | undefined)[]): boolean {
  return values.some((v) => typeof v === 'string' && /^-?\$?\s*[\d.]*\d,\d+$/.test(v.trim()));
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function utcDate(y: number, m: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

export function parseDate(v: Cell | undefined): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    return v >= 1 && v < 2958466 ? new Date(EXCEL_EPOCH + Math.floor(v) * 86_400_000) : null;
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return utcDate(+m[3], +m[2], +m[1]);
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
  if (m) return utcDate(+m[1], +m[2], +m[3]);
  return null;
}

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

const TRUE_VALUES = new Set(['si', 's', '1', 'true', 'verdadero', 'x']);
const FALSE_VALUES = new Set(['no', 'n', '0', 'false', 'falso']);

export function parseBoolean(v: Cell | undefined): boolean | null {
  if (typeof v === 'boolean') return v;
  const t = normalizeText(cellToText(v));
  if (TRUE_VALUES.has(t)) return true;
  if (FALSE_VALUES.has(t)) return false;
  return null;
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function matchEnum(value: string, allowed: string[]): { match?: string; suggestion?: string } {
  const n = normalizeText(value);
  const exact = allowed.find((a) => normalizeText(a) === n);
  if (exact) return { match: exact };
  if (n === '') return {};
  const suggestion = allowed.find((a) => {
    const na = normalizeText(a);
    return na.startsWith(n) || na.includes(n) || n.includes(na) || levenshtein(n, na) <= 2;
  });
  return suggestion ? { suggestion } : {};
}

export function checkFileNameConvention(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}_[^/\\]+\.(xlsx|xls|csv)$/i.test(name);
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npx vitest run test/validation/normalize.test.ts`
Esperado: PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add lib/validation test/validation
git commit -m "feat(validation): tipos y normalización de valores

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Lectura de CSV y Excel

**Files:**
- Create: `lib/validation/read.ts`, `test/helpers.ts`
- Test: `test/validation/read.test.ts`

**Interfaces:**
- Consume: `Cell`, `Row`, `Sheet`, `ParsedFile` (Task 2); `isEmpty` (Task 2).
- Produce: `readFile(bytes: Uint8Array, fileName: string): ParsedFile` (lanza `ReadError`), `class ReadError extends Error { code: ReadErrorCode }`, `ReadErrorCode = 'formato_no_soportado' | 'archivo_corrupto' | 'archivo_vacio' | 'demasiadas_filas'`, `MAX_ROWS = 50_000`, `decodeText(bytes): string`, `extensionOf(name): string`.
- Produce (`test/helpers.ts`): `xlsxBytes(sheets: Record<string, Cell[][]>): Uint8Array`, `csvBytes(text, encoding?, bom?): Uint8Array`, `parsed(fileName, rows: Cell[][], sheetName?): ParsedFile`.

- [ ] **Step 1: Crear `test/helpers.ts`**

```ts
import * as XLSX from 'xlsx';
import type { Cell, ParsedFile } from '@/lib/validation/types';

export function xlsxBytes(sheets: Record<string, Cell[][]>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows, { cellDates: true }), name);
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

export function csvBytes(text: string, encoding: 'utf8' | 'latin1' = 'utf8', bom = false): Uint8Array {
  const body = Buffer.from(text, encoding);
  return new Uint8Array(bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]) : body);
}

/** ParsedFile en memoria: cada fila de `rows` es la fila i+1. */
export function parsed(fileName: string, rows: Cell[][], sheetName = 'Hoja1'): ParsedFile {
  return { fileName, sheets: [{ name: sheetName, lines: rows.map((cells, i) => ({ line: i + 1, cells })) }] };
}
```

- [ ] **Step 2: Escribir los tests que fallan**

`test/validation/read.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_ROWS, ReadError, readFile } from '@/lib/validation/read';
import { csvBytes, xlsxBytes } from '../helpers';

function readError(fn: () => unknown): ReadError {
  try {
    fn();
  } catch (e) {
    if (e instanceof ReadError) return e;
    throw e;
  }
  throw new Error('no lanzó ReadError');
}

describe('readFile CSV', () => {
  it('detecta separador ; y conserva números de fila', () => {
    const f = readFile(csvBytes('Nombre completo;Email;Rol\nAna;ana@x.com;Editor\n'), 'u.csv');
    expect(f.sheets).toHaveLength(1);
    expect(f.sheets[0].lines[0].cells).toEqual(['Nombre completo', 'Email', 'Rol']);
    expect(f.sheets[0].lines[1]).toEqual({ line: 2, cells: ['Ana', 'ana@x.com', 'Editor'] });
  });

  it('decodifica Latin-1 con separador ,', () => {
    const f = readFile(csvBytes('Código de práctica,Nombre de práctica\n1,Hemograma\n', 'latin1'), 'p.csv');
    expect(f.sheets[0].lines[0].cells[0]).toBe('Código de práctica');
  });

  it('quita el BOM de UTF-8', () => {
    const f = readFile(csvBytes('Nombre completo;Email\nAna;a@x.com\n', 'utf8', true), 'u.csv');
    expect(f.sheets[0].lines[0].cells[0]).toBe('Nombre completo');
  });

  it('saltea filas vacías sin perder la numeración', () => {
    const f = readFile(csvBytes('a;b\n\n;\n1;2\n'), 'x.csv');
    expect(f.sheets[0].lines.map((l) => l.line)).toEqual([1, 4]);
  });
});

describe('readFile Excel', () => {
  it('lee todas las hojas con tipos nativos', () => {
    const bytes = xlsxBytes({
      Instrucciones: [['Leer antes de completar']],
      Insumos: [
        ['Código de insumo', 'Precio de última compra', 'Fecha de última compra'],
        ['INS1', 12.5, new Date(Date.UTC(2026, 6, 15))],
      ],
    });
    const f = readFile(bytes, 'insumos.xlsx');
    expect(f.sheets.map((s) => s.name)).toEqual(['Instrucciones', 'Insumos']);
    const row = f.sheets[1].lines[1];
    expect(row.line).toBe(2);
    expect(row.cells[1]).toBe(12.5);
    expect(row.cells[2]).toBeInstanceOf(Date);
  });

  it('respeta la fila real cuando hay filas vacías arriba', () => {
    const f = readFile(xlsxBytes({ Hoja1: [[], [], ['Nombre del sector'], ['Hematología']] }), 's.xlsx');
    expect(f.sheets[0].lines[0].line).toBe(3);
    expect(f.sheets[0].lines[1]).toEqual({ line: 4, cells: ['Hematología'] });
  });
});

describe('readFile errores', () => {
  it('rechaza extensiones no soportadas', () => {
    expect(readError(() => readFile(new Uint8Array([1, 2]), 'a.pdf')).code).toBe('formato_no_soportado');
  });
  it('rechaza un .xlsx que no es Excel', () => {
    expect(readError(() => readFile(csvBytes('hola;chau'), 'a.xlsx')).code).toBe('archivo_corrupto');
  });
  it('rechaza archivos vacíos', () => {
    expect(readError(() => readFile(csvBytes('\n\n'), 'a.csv')).code).toBe('archivo_vacio');
  });
  it('rechaza más de MAX_ROWS filas', () => {
    const text = 'Nombre del sector\n' + 'S\n'.repeat(MAX_ROWS + 1);
    expect(readError(() => readFile(csvBytes(text), 'a.csv')).code).toBe('demasiadas_filas');
  });
});
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `npx vitest run test/validation/read.test.ts`
Esperado: FAIL, "Failed to resolve import '@/lib/validation/read'".

- [ ] **Step 4: Implementar `lib/validation/read.ts`**

```ts
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { isEmpty } from './normalize';
import type { Cell, ParsedFile, Row, Sheet } from './types';

export const MAX_ROWS = 50_000;
export const SUPPORTED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];

export type ReadErrorCode = 'formato_no_soportado' | 'archivo_corrupto' | 'archivo_vacio' | 'demasiadas_filas';

export class ReadError extends Error {
  constructor(
    public readonly code: ReadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReadError';
  }
}

const CORRUPT_MESSAGE =
  'No se pudo leer el archivo: no parece un Excel válido (puede estar dañado o tener la extensión equivocada).';

export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i === -1 ? '' : fileName.slice(i).toLowerCase();
}

export function decodeText(bytes: Uint8Array): string {
  const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return new TextDecoder('windows-1252').decode(body);
  }
}

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const isCfb = (b: Uint8Array) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;

function toLines(matrix: Cell[][], offset = 0): Row[] {
  const lines: Row[] = [];
  matrix.forEach((cells, i) => {
    if (cells.some((c) => !isEmpty(c))) lines.push({ line: offset + i + 1, cells });
  });
  return lines;
}

function readCsv(bytes: Uint8Array): Sheet[] {
  const result = Papa.parse<string[]>(decodeText(bytes), {
    delimitersToGuess: [';', ',', '\t'],
    skipEmptyLines: false,
  });
  const matrix: Cell[][] = result.data.map((r) => r.map((c) => (c.trim() === '' ? null : c)));
  return [{ name: 'CSV', lines: toLines(matrix) }];
}

function readExcel(bytes: Uint8Array): Sheet[] {
  if (!isZip(bytes) && !isCfb(bytes)) throw new ReadError('archivo_corrupto', CORRUPT_MESSAGE);
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, { type: 'array', cellDates: true });
  } catch {
    throw new ReadError('archivo_corrupto', CORRUPT_MESSAGE);
  }
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const offset = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s.r : 0;
    const matrix = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
    return { name, lines: toLines(matrix, offset) };
  });
}

export function readFile(bytes: Uint8Array, fileName: string): ParsedFile {
  const ext = extensionOf(fileName);
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new ReadError(
      'formato_no_soportado',
      `Formato no soportado (${ext || 'sin extensión'}). Usá un archivo .csv, .xlsx o .xls.`,
    );
  }
  const sheets = (ext === '.csv' ? readCsv(bytes) : readExcel(bytes)).filter((s) => s.lines.length > 0);
  if (sheets.length === 0) {
    throw new ReadError('archivo_vacio', 'El archivo está vacío: no encontré ninguna fila con datos.');
  }
  if (sheets.some((s) => s.lines.length - 1 > MAX_ROWS)) {
    throw new ReadError(
      'demasiadas_filas',
      `El archivo supera el máximo de ${MAX_ROWS.toLocaleString('es-AR')} filas.`,
    );
  }
  return { fileName, sheets };
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npx vitest run test/validation/read.test.ts`
Esperado: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/validation/read.ts test/helpers.ts test/validation/read.test.ts
git commit -m "feat(validation): lectura de CSV (separador/encoding) y Excel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Los 14 esquemas

**Files:**
- Create: `lib/validation/schemas.ts`
- Test: `test/validation/schemas.test.ts`

**Interfaces:**
- Consume: `Schema`, `ColumnSpec`, `STEP_IDS`, `StepId` (Task 2); `normalizeHeader` (Task 2).
- Produce: `SCHEMAS: Schema[]` (en el orden de `STEP_IDS`) y `getSchema(id: StepId): Schema`.
- Claves de columna (las usan las Tasks 6 y 7): `usuarios{nombre,email,rol}`, `sedes{nombre,codigo}`, `sectores{nombre}`, `practicas{codigo,nombre}`, `insumos{codigo,nombre,precio,fecha,proveedor,activo,cantidad}`, `relaciones_consumo{insumo,practica,rendimiento}`, `practicas_compuestas{madre,hija}`, `facturacion{codigoPractica,nombrePractica,codigoConvenio,nombreConvenio,sede,cantidad,bruto,ventanilla,derivacion}`, `costos_indirectos{nombre,monto}`, `convenios{codigo,nombre,tipo,ajuste,region}`, `obras_sociales{codigo,nombre,valorUb}`, `modulos_obra_social{codigo,descripcion}`, `precios_competencia{codigo,descripcion,precio}`, `matching_codigos{competencia,propio}`.

- [ ] **Step 1: Escribir los tests que fallan**

`test/validation/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeHeader } from '@/lib/validation/normalize';
import { SCHEMAS, getSchema } from '@/lib/validation/schemas';
import { STEP_IDS } from '@/lib/validation/types';

describe('SCHEMAS', () => {
  it('tiene los 14 pasos en orden', () => {
    expect(SCHEMAS.map((s) => s.id)).toEqual([...STEP_IDS]);
  });

  it('cada esquema tiene al menos una columna obligatoria y claves de nombre de archivo', () => {
    for (const s of SCHEMAS) {
      expect(s.columns.some((c) => c.level === 'required'), s.id).toBe(true);
      expect(s.fileNameKeys.length, s.id).toBeGreaterThan(0);
      for (const k of s.fileNameKeys) expect(k, s.id).toMatch(/^[a-z]+$/);
    }
  });

  it('labels y alias no colisionan dentro de un esquema', () => {
    for (const s of SCHEMAS) {
      const all = s.columns.flatMap((c) => [c.label, ...(c.aliases ?? [])].map(normalizeHeader));
      expect(new Set(all).size, s.id).toBe(all.length);
    }
  });

  it('reglas puntuales de la spec', () => {
    expect(getSchema('obras_sociales').columns.find((c) => c.key === 'valorUb')?.level).toBe('required');
    expect(getSchema('usuarios').columns.find((c) => c.key === 'rol')?.enumValues).toEqual([
      'Administrador',
      'Editor',
      'Solo lectura',
    ]);
    expect(getSchema('convenios').columns.find((c) => c.key === 'tipo')?.enumValues).toEqual(['Derivación', 'Especial']);
    expect(getSchema('sedes').columns.find((c) => c.key === 'codigo')?.level).toBe('recommended');
    expect(getSchema('practicas').dynamic?.firstRequired).toBe(true);
    expect(getSchema('modulos_obra_social').dynamic?.firstRequired).toBe(false);
    expect(getSchema('relaciones_consumo').columns.find((c) => c.key === 'rendimiento')?.greaterThan).toBe(0);
  });

  it('los placeholders de la plantilla se reconocen', () => {
    expect(getSchema('practicas').dynamic!.placeholder.test(normalizeHeader('[Nombre del arancel 1]'))).toBe(true);
    expect(getSchema('practicas').dynamic!.placeholder.test(normalizeHeader('Nombre del arancel 2'))).toBe(true);
    expect(getSchema('practicas').dynamic!.placeholder.test(normalizeHeader('Derivación'))).toBe(false);
    expect(
      getSchema('modulos_obra_social').dynamic!.placeholder.test(normalizeHeader('[Código de obra social 1]')),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/validation/schemas.test.ts`
Esperado: FAIL, "Failed to resolve import '@/lib/validation/schemas'".

- [ ] **Step 3: Implementar `lib/validation/schemas.ts`**

```ts
import type { ColType, ColumnSpec, Schema, StepId } from './types';

type Extra = Partial<Omit<ColumnSpec, 'key' | 'label' | 'level' | 'type'>>;

const req = (key: string, label: string, type: ColType = 'text', extra: Extra = {}): ColumnSpec => ({
  key,
  label,
  level: 'required',
  type,
  ...extra,
});
const rec = (key: string, label: string, type: ColType = 'text', extra: Extra = {}): ColumnSpec => ({
  key,
  label,
  level: 'recommended',
  type,
  ...extra,
});
const opt = (key: string, label: string, type: ColType = 'text', extra: Extra = {}): ColumnSpec => ({
  key,
  label,
  level: 'optional',
  type,
  ...extra,
});

export const SCHEMAS: Schema[] = [
  {
    id: 'usuarios',
    title: 'Usuarios',
    category: '01',
    sheetNames: ['Usuarios'],
    fileNameKeys: ['usuarios'],
    templateFile: 'Template_Usuarios_Optacost.xlsx',
    columns: [
      req('nombre', 'Nombre completo', 'text', { aliases: ['nombre y apellido', 'apellido y nombre'] }),
      req('email', 'Email', 'email', { aliases: ['mail', 'correo', 'correo electronico', 'e-mail'], unique: true }),
      req('rol', 'Rol', 'enum', { enumValues: ['Administrador', 'Editor', 'Solo lectura'] }),
    ],
  },
  {
    id: 'sedes',
    title: 'Sedes',
    category: '01',
    sheetNames: ['Sedes'],
    fileNameKeys: ['sedes'],
    templateFile: 'Template_Sedes_Optacost.xlsx',
    columns: [
      req('nombre', 'Nombre de la sede', 'text', { aliases: ['nombre sede', 'sucursal'], unique: true }),
      rec('codigo', 'Código', 'text', { aliases: ['codigo de sede', 'codigo sede', 'cod. sede'], unique: true }),
    ],
  },
  {
    id: 'sectores',
    title: 'Sectores',
    category: '01',
    sheetNames: ['Sectores'],
    fileNameKeys: ['sectores', 'centrosdecosto'],
    templateFile: 'Template_Sectores_Optacost.xlsx',
    columns: [
      req('nombre', 'Nombre del sector', 'text', {
        aliases: ['sector', 'nombre sector', 'centro de costo'],
        unique: true,
      }),
    ],
  },
  {
    id: 'practicas',
    title: 'Prácticas',
    category: '02',
    sheetNames: ['Prácticas', 'Practicas'],
    fileNameKeys: ['practicas'],
    templateFile: 'Template_Practicas_Optacost.xlsx',
    columns: [
      req('codigo', 'Código de práctica', 'text', {
        aliases: ['codigo practica', 'cod. practica', 'cod practica', 'codigo'],
        unique: true,
      }),
      req('nombre', 'Nombre de práctica', 'text', { aliases: ['nombre practica', 'descripcion', 'practica'] }),
    ],
    dynamic: {
      placeholder: /^\[?\s*nombre del arancel\s*\d*\s*\]?$/,
      min: 0,
      firstRequired: true,
      missingMessage:
        'Agregá al menos una columna de arancel, con el nombre real del arancel como encabezado (por ejemplo "Derivación").',
      replaceHint: 'reemplazalo por el nombre real del arancel (por ejemplo "Derivación" o "Especial")',
    },
    providesCatalog: { catalog: 'practicas', column: 'codigo' },
  },
  {
    id: 'insumos',
    title: 'Insumos',
    category: '02',
    sheetNames: ['Insumos'],
    fileNameKeys: ['insumos'],
    templateFile: 'Template_Insumos_Optacost.xlsx',
    columns: [
      req('codigo', 'Código de insumo', 'text', {
        aliases: ['codigo insumo', 'cod. insumo', 'cod insumo', 'codigo'],
        unique: true,
      }),
      req('nombre', 'Nombre de insumo', 'text', { aliases: ['nombre insumo', 'descripcion', 'insumo'] }),
      req('precio', 'Precio de última compra', 'number', {
        aliases: ['precio', 'precio ultima compra', 'ultimo precio'],
        min: 0,
      }),
      req('fecha', 'Fecha de última compra', 'date', { aliases: ['fecha', 'fecha ultima compra'] }),
      opt('proveedor', 'Proveedor'),
      opt('activo', 'Activo', 'boolean'),
      opt('cantidad', 'Cantidad', 'number', { aliases: ['stock'], min: 0 }),
    ],
    providesCatalog: { catalog: 'insumos', column: 'codigo' },
  },
  {
    id: 'relaciones_consumo',
    title: 'Relaciones de consumo',
    category: '02',
    sheetNames: ['Relaciones de consumo'],
    fileNameKeys: ['relacionesdeconsumo', 'relacionesconsumo'],
    templateFile: 'Template_Relaciones_Consumo_Optacost.xlsx',
    columns: [
      req('insumo', 'Código de insumo', 'text', { aliases: ['codigo insumo', 'cod. insumo'] }),
      req('practica', 'Código de práctica', 'text', { aliases: ['codigo practica', 'cod. practica'] }),
      req('rendimiento', 'Rendimiento', 'number', { greaterThan: 0 }),
    ],
    uniquePairs: [['insumo', 'practica']],
    catalogRefs: [
      { column: 'insumo', catalog: 'insumos' },
      { column: 'practica', catalog: 'practicas' },
    ],
  },
  {
    id: 'practicas_compuestas',
    title: 'Prácticas compuestas',
    category: '02',
    sheetNames: ['Practicas Compuestas', 'Prácticas compuestas'],
    fileNameKeys: ['practicascompuestas', 'practicasrelacionadas'],
    templateFile: 'Template_Practicas_Relacionadas_Optacost.xlsx',
    columns: [
      req('madre', 'Código práctica madre', 'text', { aliases: ['codigo de practica madre', 'practica madre', 'madre'] }),
      req('hija', 'Código práctica hija', 'text', { aliases: ['codigo de practica hija', 'practica hija', 'hija'] }),
    ],
    uniquePairs: [['madre', 'hija']],
    distinctPair: ['madre', 'hija'],
    catalogRefs: [
      { column: 'madre', catalog: 'practicas' },
      { column: 'hija', catalog: 'practicas' },
    ],
  },
  {
    id: 'facturacion',
    title: 'Facturación',
    category: '03',
    sheetNames: ['Facturación', 'Facturacion'],
    fileNameKeys: ['facturacion'],
    templateFile: 'Template_Facturacion_Optacost.xlsx',
    columns: [
      req('codigoPractica', 'Código de práctica', 'text', { aliases: ['codigo practica', 'cod. practica'] }),
      req('nombrePractica', 'Nombre de práctica', 'text', { aliases: ['nombre practica', 'practica'] }),
      req('codigoConvenio', 'Código de convenio', 'text', { aliases: ['codigo convenio', 'cod. convenio'] }),
      req('nombreConvenio', 'Nombre de convenio', 'text', { aliases: ['nombre convenio', 'convenio'] }),
      req('sede', 'Sede'),
      req('cantidad', 'Cantidad facturada', 'number', { aliases: ['cantidad'], min: 0 }),
      req('bruto', 'Bruto facturado', 'number', { aliases: ['bruto', 'monto facturado'] }),
      opt('ventanilla', 'Bruto en ventanilla', 'number', { aliases: ['ventanilla'] }),
      opt('derivacion', 'Identificador de derivación', 'text', { aliases: ['derivacion', 'derivada'] }),
    ],
    catalogRefs: [{ column: 'codigoPractica', catalog: 'practicas' }],
  },
  {
    id: 'costos_indirectos',
    title: 'Costos indirectos',
    category: '03',
    sheetNames: ['Costos Indirectos', 'Costos indirectos'],
    fileNameKeys: ['costosindirectos'],
    templateFile: 'Template_Costos_Indirectos_Optacost.xlsx',
    columns: [
      req('nombre', 'Nombre', 'text', { aliases: ['concepto', 'nombre del costo'] }),
      req('monto', 'Monto', 'number', { aliases: ['importe'], min: 0 }),
    ],
  },
  {
    id: 'convenios',
    title: 'Convenios de derivación',
    category: '04',
    sheetNames: ['Convenios de derivación', 'Convenios'],
    fileNameKeys: ['conveniosdederivacion', 'convenios'],
    templateFile: 'Template_Convenios_Optacost.xlsx',
    columns: [
      req('codigo', 'Código', 'text', { aliases: ['codigo de convenio', 'codigo convenio'], unique: true }),
      req('nombre', 'Nombre', 'text', { aliases: ['nombre de convenio', 'nombre convenio'] }),
      req('tipo', 'Tipo de arancel', 'enum', { enumValues: ['Derivación', 'Especial'] }),
      opt('ajuste', 'Ajuste', 'number'),
      opt('region', 'Región'),
    ],
  },
  {
    id: 'obras_sociales',
    title: 'Obras sociales',
    category: '04',
    sheetNames: ['Obras Sociales', 'Obras sociales'],
    fileNameKeys: ['obrassociales'],
    templateFile: 'Template_Obras_Sociales_Optacost.xlsx',
    columns: [
      req('codigo', 'Código', 'text', { aliases: ['codigo de obra social', 'codigo os'], unique: true }),
      req('nombre', 'Nombre', 'text', { aliases: ['nombre de obra social', 'obra social'] }),
      req('valorUb', 'Valor UB', 'number', { aliases: ['ub', 'valor de ub'], min: 0 }),
    ],
  },
  {
    id: 'modulos_obra_social',
    title: 'Módulos por obra social',
    category: '04',
    sheetNames: ['Módulos por Obra Social', 'Modulos por obra social'],
    fileNameKeys: ['modulosporobrasocial', 'modulosobrasocial', 'modulosobrassociales'],
    templateFile: 'Template_Modulos_Obra_Social_Optacost.xlsx',
    columns: [
      req('codigo', 'Código de práctica', 'text', { aliases: ['codigo practica', 'cod. practica'], unique: true }),
      req('descripcion', 'Descripción de práctica', 'text', {
        aliases: ['descripcion', 'descripcion practica', 'nombre de practica'],
      }),
    ],
    dynamic: {
      placeholder: /^\[?\s*codigo de obra social\s*\d*\s*\]?$/,
      min: 0,
      firstRequired: false,
      missingMessage: 'Agregá al menos una columna por obra social, con su código como encabezado.',
      replaceHint: 'reemplazalo por el código real de la obra social',
    },
    catalogRefs: [{ column: 'codigo', catalog: 'practicas' }],
  },
  {
    id: 'precios_competencia',
    title: 'Lista de precios de competencia',
    category: '04',
    sheetNames: ['Lista de precios (competencia)', 'Lista de precios'],
    fileNameKeys: ['listaprecioscompetencia', 'preciosdecompetencia', 'precioscompetencia', 'listadeprecios'],
    templateFile: 'Template_Lista_Precios_Competencia_Optacost.xlsx',
    columns: [
      req('codigo', 'Código de examen', 'text', { aliases: ['codigo examen', 'codigo'], unique: true }),
      req('descripcion', 'Descripción', 'text', { aliases: ['descripcion de examen', 'descripcion examen'] }),
      req('precio', 'Precio', 'number', { min: 0 }),
    ],
  },
  {
    id: 'matching_codigos',
    title: 'Matching de códigos',
    category: '04',
    sheetNames: ['Matching de códigos', 'Matching de codigos'],
    fileNameKeys: ['matchingdecodigos', 'matchingcodigos', 'matching'],
    templateFile: 'Template_Matching_Codigos_Optacost.xlsx',
    columns: [
      req('competencia', 'Código de examen de la competencia', 'text', {
        aliases: ['codigo competencia', 'codigo de la competencia'],
      }),
      req('propio', 'Código de examen propio', 'text', { aliases: ['codigo propio', 'codigo de practica'] }),
    ],
    uniquePairs: [['competencia', 'propio']],
    catalogRefs: [{ column: 'propio', catalog: 'practicas' }],
  },
];

const BY_ID = new Map(SCHEMAS.map((s) => [s.id, s]));

export function getSchema(id: StepId): Schema {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`Esquema desconocido: ${id}`);
  return s;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/validation/schemas.test.ts`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/validation/schemas.ts test/validation/schemas.test.ts
git commit -m "feat(validation): esquemas de los 14 archivos de onboarding

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Fila de encabezado y mapeo de columnas

**Files:**
- Create: `lib/validation/columns.ts`
- Test: `test/validation/columns.test.ts`

**Interfaces:**
- Consume: `Sheet`, `Row`, `Schema`, `ColumnSpec`, `Issue` (Task 2); `normalizeHeader`, `cellToText`, `isEmpty` (Task 2); `getSchema` (Task 4).
- Produce: `HEADER_SEARCH_ROWS = 10`, `headerMatches(header: string, col: ColumnSpec): boolean`, `resolveHeader(sheet: Sheet, schema: Schema): ResolvedSheet` con `ResolvedSheet = { headerLine: number; headers: string[]; rows: Row[] }`, `mapColumns(headers: string[], schema: Schema): ColumnMapping` con `ColumnMapping = { fixed: Map<string, number>; dynamic: { index: number; header: string }[]; errors: Issue[]; warnings: Issue[] }`.

- [ ] **Step 1: Escribir los tests que fallan**

`test/validation/columns.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mapColumns, resolveHeader } from '@/lib/validation/columns';
import { getSchema } from '@/lib/validation/schemas';
import { parsed } from '../helpers';

describe('resolveHeader', () => {
  it('encuentra el encabezado aunque haya un título arriba (Review Focus 1)', () => {
    const file = parsed('u.xlsx', [
      ['Listado de usuarios del laboratorio'],
      [null],
      ['Nombre completo', 'Email', 'Rol'],
      ['Ana', 'ana@x.com', 'Editor'],
    ]);
    const r = resolveHeader(file.sheets[0], getSchema('usuarios'));
    expect(r.headerLine).toBe(3);
    expect(r.headers).toEqual(['Nombre completo', 'Email', 'Rol']);
    expect(r.rows.map((x) => x.line)).toEqual([4]);
  });

  it('si ninguna fila coincide usa la primera', () => {
    const r = resolveHeader(parsed('x.csv', [['foo', 'bar'], ['1', '2']]).sheets[0], getSchema('usuarios'));
    expect(r.headerLine).toBe(1);
  });
});

describe('mapColumns', () => {
  it('mapea por label o alias ignorando tildes y mayúsculas', () => {
    const m = mapColumns(['NOMBRE COMPLETO', 'Correo', 'rol'], getSchema('usuarios'));
    expect([...m.fixed.entries()]).toEqual([
      ['nombre', 0],
      ['email', 1],
      ['rol', 2],
    ]);
    expect(m.errors).toEqual([]);
  });

  it('reporta obligatorias faltantes como error y recomendadas como advertencia', () => {
    expect(mapColumns(['Nombre completo'], getSchema('usuarios')).errors.map((e) => e.column)).toEqual(['Email', 'Rol']);
    const sedes = mapColumns(['Nombre de la sede'], getSchema('sedes'));
    expect(sedes.errors).toEqual([]);
    expect(sedes.warnings.map((w) => w.rule)).toEqual(['columna_recomendada_faltante']);
  });

  it('columnas desconocidas y repetidas son advertencias', () => {
    const m = mapColumns(['Nombre completo', 'Email', 'Rol', 'Teléfono', 'Email'], getSchema('usuarios'));
    expect(m.warnings.map((w) => w.column)).toEqual(['Teléfono', 'Email']);
    expect(m.fixed.get('email')).toBe(1);
  });

  it('detecta columnas dinámicas y placeholders sin reemplazar', () => {
    const m = mapColumns(
      ['Código de práctica', 'Nombre de práctica', 'Derivación', '[Nombre del arancel 2]', ''],
      getSchema('practicas'),
    );
    expect(m.dynamic).toEqual([{ index: 2, header: 'Derivación' }]);
    expect(m.errors.map((e) => e.rule)).toEqual(['placeholder_sin_reemplazar']);
  });

  it('exige al menos una columna dinámica', () => {
    const m = mapColumns(['Código de práctica', 'Nombre de práctica'], getSchema('practicas'));
    expect(m.errors.map((e) => e.rule)).toEqual(['sin_columnas_dinamicas']);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/validation/columns.test.ts`
Esperado: FAIL, "Failed to resolve import '@/lib/validation/columns'".

- [ ] **Step 3: Implementar `lib/validation/columns.ts`**

```ts
import { cellToText, isEmpty, normalizeHeader } from './normalize';
import type { Cell, ColumnSpec, Issue, Row, Schema, Sheet } from './types';

export const HEADER_SEARCH_ROWS = 10;

export function headerMatches(header: string, col: ColumnSpec): boolean {
  const h = normalizeHeader(header);
  return h !== '' && [col.label, ...(col.aliases ?? [])].some((l) => normalizeHeader(l) === h);
}

function matchCount(cells: Cell[], schema: Schema): number {
  return schema.columns.filter((c) => cells.some((cell) => !isEmpty(cell) && headerMatches(cellToText(cell), c)))
    .length;
}

export type ResolvedSheet = { headerLine: number; headers: string[]; rows: Row[] };

/** Elige como encabezado la fila (entre las primeras 10) con más columnas reconocidas. */
export function resolveHeader(sheet: Sheet, schema: Schema): ResolvedSheet {
  let best = 0;
  let bestScore = 0;
  sheet.lines.slice(0, HEADER_SEARCH_ROWS).forEach((r, i) => {
    const score = matchCount(r.cells, schema);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  const header = sheet.lines[best];
  return {
    headerLine: header?.line ?? 0,
    headers: (header?.cells ?? []).map((c) => cellToText(c)),
    rows: sheet.lines.slice(best + 1),
  };
}

export type ColumnMapping = {
  fixed: Map<string, number>;
  dynamic: { index: number; header: string }[];
  errors: Issue[];
  warnings: Issue[];
};

export function mapColumns(headers: string[], schema: Schema): ColumnMapping {
  const fixed = new Map<string, number>();
  const dynamic: { index: number; header: string }[] = [];
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  headers.forEach((header, index) => {
    if (header.trim() === '') return;
    const col = schema.columns.find((c) => headerMatches(header, c));
    if (col) {
      if (fixed.has(col.key)) {
        warnings.push({
          rule: 'columna_desconocida',
          column: header,
          message: `La columna "${header}" está repetida; se usa la primera.`,
        });
      } else {
        fixed.set(col.key, index);
      }
      return;
    }
    if (schema.dynamic) {
      if (/[[\]]/.test(header) || schema.dynamic.placeholder.test(normalizeHeader(header))) {
        errors.push({
          rule: 'placeholder_sin_reemplazar',
          column: header,
          message: `El encabezado "${header}" es un marcador de la plantilla: ${schema.dynamic.replaceHint}.`,
        });
        return;
      }
      dynamic.push({ index, header: header.trim() });
      return;
    }
    warnings.push({
      rule: 'columna_desconocida',
      column: header,
      message: `La columna "${header}" no forma parte de la plantilla de ${schema.title}; se va a ignorar.`,
    });
  });

  for (const col of schema.columns) {
    if (fixed.has(col.key)) continue;
    if (col.level === 'required') {
      errors.push({ rule: 'columna_faltante', column: col.label, message: `Falta la columna obligatoria "${col.label}".` });
    } else if (col.level === 'recommended') {
      warnings.push({
        rule: 'columna_recomendada_faltante',
        column: col.label,
        message: `Falta la columna recomendada "${col.label}".`,
      });
    }
  }

  if (schema.dynamic && dynamic.length === 0) {
    errors.push({ rule: 'sin_columnas_dinamicas', message: schema.dynamic.missingMessage });
  }

  return { fixed, dynamic, errors, warnings };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/validation/columns.test.ts`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/validation/columns.ts test/validation/columns.test.ts
git commit -m "feat(validation): detección de encabezado y mapeo de columnas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Validación por fila, catálogos y reporte

**Files:**
- Create: `lib/validation/validate.ts`
- Test: `test/validation/validate.test.ts`

**Interfaces:**
- Consume: `resolveHeader`, `mapColumns` (Task 5); funciones de `normalize.ts` (Task 2); `getSchema` (Task 4); tipos (Task 2).
- Produce: `MAX_ISSUES = 500`, `type Catalogs = Partial<Record<CatalogName, Set<string>>>` (con valores normalizados por `normalizeCode`), `pickSheet(file: ParsedFile, schema: Schema): Sheet`, `validateFile(file: ParsedFile, schema: Schema, catalogs?: Catalogs): ValidationReport`, `extractCatalog(file: ParsedFile, schema: Schema): string[] | undefined`.

- [ ] **Step 1: Escribir los tests que fallan**

`test/validation/validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getSchema } from '@/lib/validation/schemas';
import { extractCatalog, MAX_ISSUES, pickSheet, validateFile } from '@/lib/validation/validate';
import type { Cell, ParsedFile } from '@/lib/validation/types';
import { parsed } from '../helpers';

const USERS_HEADER: Cell[] = ['Nombre completo', 'Email', 'Rol'];
const rules = (issues: { rule: string }[]) => issues.map((i) => i.rule);

describe('validateFile: archivo correcto', () => {
  it('sin errores y con conteo de filas', () => {
    const r = validateFile(
      parsed('2026-07-15_Usuarios.xlsx', [USERS_HEADER, ['Ana', 'ana@x.com', 'Editor'], ['Juan', 'j@x.com', 'Solo lectura']]),
      getSchema('usuarios'),
    );
    expect(r).toMatchObject({ ok: true, rows: 2, errorCount: 0, warningCount: 0, schemaId: 'usuarios', sheetName: 'Hoja1' });
  });
});

describe('validateFile: reglas por celda', () => {
  it('celda obligatoria vacía, email inválido y rol con sugerencia', () => {
    const r = validateFile(
      parsed('2026-07-15_Usuarios.xlsx', [USERS_HEADER, ['Ana', '', 'Admin'], ['Juan', 'juan@', 'Editor']]),
      getSchema('usuarios'),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => [e.rule, e.row])).toEqual([
      ['celda_vacia', 2],
      ['valor_no_permitido', 2],
      ['tipo_invalido', 3],
    ]);
    expect(r.errors[1].suggestion).toBe('Administrador');
    expect(r.errors[1].message).toContain('¿Quisiste decir "Administrador"?');
  });

  it('duplicados ignorando mayúsculas y espacios (Review Focus 3)', () => {
    const r = validateFile(
      parsed('2026-07-15_Usuarios.xlsx', [USERS_HEADER, ['Ana', 'Ana@Lab.com', 'Editor'], ['Ana B', 'ana@lab.com ', 'Editor']]),
      getSchema('usuarios'),
    );
    expect(rules(r.errors)).toEqual(['duplicado']);
    expect(r.errors[0]).toMatchObject({ row: 3 });
    expect(r.errors[0].message).toContain('fila 2');
  });

  it('números: tipo, negativos, mayor que cero y coma decimal', () => {
    const header: Cell[] = ['Código de insumo', 'Código de práctica', 'Rendimiento'];
    const r = validateFile(
      parsed('2026-07-15_Relaciones.xlsx', [header, ['I1', 'P1', '10,5'], ['I2', 'P1', 0], ['I3', 'P1', 'diez']]),
      getSchema('relaciones_consumo'),
      { insumos: new Set(['i1', 'i2', 'i3']), practicas: new Set(['p1']) },
    );
    expect(r.errors.map((e) => [e.rule, e.row])).toEqual([
      ['fuera_de_rango', 3],
      ['tipo_invalido', 4],
    ]);
  });

  it('fechas inválidas y booleanos', () => {
    const header: Cell[] = ['Código de insumo', 'Nombre de insumo', 'Precio de última compra', 'Fecha de última compra', 'Activo'];
    const r = validateFile(
      parsed('2026-07-15_Insumos.xlsx', [header, ['I1', 'Tubo', '1.234,50', '15/07/2026', 'Sí'], ['I2', 'Aguja', -3, '31/02/2026', 'quizás']]),
      getSchema('insumos'),
    );
    expect(r.errors.map((e) => [e.rule, e.column])).toEqual([
      ['fuera_de_rango', 'Precio de última compra'],
      ['tipo_invalido', 'Fecha de última compra'],
      ['valor_no_permitido', 'Activo'],
    ]);
  });

  it('pares únicos y madre distinta de hija', () => {
    const r = validateFile(
      parsed('2026-07-15_PracticasCompuestas.xlsx', [['Código práctica madre', 'Código práctica hija'], ['100', '101'], ['100', '101'], ['200', '200']]),
      getSchema('practicas_compuestas'),
      { practicas: new Set(['100', '101', '200']) },
    );
    expect(r.errors.map((e) => [e.rule, e.row])).toEqual([
      ['duplicado', 3],
      ['fuera_de_rango', 4],
    ]);
  });
});

describe('validateFile: columnas dinámicas', () => {
  const header: Cell[] = ['Código de práctica', 'Nombre de práctica', 'Derivación', 'Especial'];
  it('valida números en aranceles y exige el primero', () => {
    const r = validateFile(
      parsed('2026-07-15_Practicas.xlsx', [header, ['1', 'Hemograma', '1.500,00', ''], ['2', 'Glucemia', '', 300], ['3', 'Urea', 'caro', -1]]),
      getSchema('practicas'),
    );
    expect(r.dynamicColumns).toEqual(['Derivación', 'Especial']);
    expect(r.errors.map((e) => [e.rule, e.row, e.column])).toEqual([
      ['celda_vacia', 3, 'Derivación'],
      ['tipo_invalido', 4, 'Derivación'],
      ['fuera_de_rango', 4, 'Especial'],
    ]);
  });
});

describe('validateFile: plantilla y archivo', () => {
  it('fila de ejemplo de la plantilla es error y no cuenta como fila', () => {
    const r = validateFile(
      parsed('2026-07-15_PracticasCompuestas.xlsx', [['Código práctica madre', 'Código práctica hija'], ['123456', '123', '<- ejemplo, borrar antes de completar'], ['200', '201']]),
      getSchema('practicas_compuestas'),
      { practicas: new Set(['200', '201']) },
    );
    expect(rules(r.errors)).toEqual(['fila_de_ejemplo']);
    expect(r.rows).toBe(1);
  });

  it('sin filas de datos es error', () => {
    const r = validateFile(parsed('2026-07-15_Usuarios.xlsx', [USERS_HEADER]), getSchema('usuarios'));
    expect(rules(r.errors)).toEqual(['archivo_vacio']);
  });

  it('nombre fuera de convención es advertencia', () => {
    const r = validateFile(parsed('usuarios final.xlsx', [USERS_HEADER, ['Ana', 'a@x.com', 'Editor']]), getSchema('usuarios'));
    expect(r.ok).toBe(true);
    expect(rules(r.warnings)).toEqual(['nombre_archivo']);
  });

  it('limita los issues guardados pero cuenta todos', () => {
    const rows: Cell[][] = [USERS_HEADER, ...Array.from({ length: MAX_ISSUES + 10 }, (_, i) => [`U${i}`, '', 'Editor'])];
    const r = validateFile(parsed('2026-07-15_Usuarios.xlsx', rows), getSchema('usuarios'));
    expect(r.errorCount).toBe(MAX_ISSUES + 10);
    expect(r.errors).toHaveLength(MAX_ISSUES);
  });
});

describe('catálogos', () => {
  const header: Cell[] = ['Código de insumo', 'Código de práctica', 'Rendimiento'];
  it('advierte códigos que no están en el catálogo, con números y ceros a la izquierda (Review Focus 2)', () => {
    const r = validateFile(
      parsed('2026-07-15_Relaciones.xlsx', [header, ['0123', 45, 10], ['999', '45', 10]]),
      getSchema('relaciones_consumo'),
      { insumos: new Set(['123']), practicas: new Set(['45']) },
    );
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => [w.rule, w.value])).toEqual([['codigo_no_en_catalogo', '999']]);
  });

  it('avisa cuando el catálogo todavía no se validó', () => {
    const r = validateFile(parsed('2026-07-15_Relaciones.xlsx', [header, ['1', '2', 3]]), getSchema('relaciones_consumo'));
    expect(rules(r.warnings)).toEqual(['catalogo_no_verificado', 'catalogo_no_verificado']);
  });

  it('extractCatalog devuelve códigos normalizados', () => {
    const f = parsed('p.xlsx', [['Código de práctica', 'Nombre de práctica', 'Derivación'], ['0045', 'Hemograma', 10], ['HEM-2', 'Otra', 5]]);
    expect(extractCatalog(f, getSchema('practicas'))).toEqual(['45', 'hem-2']);
    expect(extractCatalog(f, getSchema('usuarios'))).toBeUndefined();
  });
});

describe('pickSheet (Review Focus 4)', () => {
  it('prefiere la hoja con el nombre del esquema y si no, la primera que no sea Instrucciones', () => {
    const file: ParsedFile = {
      fileName: 'x.xlsx',
      sheets: [
        { name: 'Instrucciones', lines: [{ line: 1, cells: ['Leer'] }] },
        { name: 'Hoja1', lines: [{ line: 1, cells: USERS_HEADER }] },
      ],
    };
    expect(pickSheet(file, getSchema('usuarios')).name).toBe('Hoja1');
    file.sheets.push({ name: 'USUARIOS', lines: [{ line: 1, cells: USERS_HEADER }] });
    expect(pickSheet(file, getSchema('usuarios')).name).toBe('USUARIOS');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/validation/validate.test.ts`
Esperado: FAIL, "Failed to resolve import '@/lib/validation/validate'".

- [ ] **Step 3: Implementar `lib/validation/validate.ts`**

```ts
import { mapColumns, resolveHeader } from './columns';
import {
  cellToText,
  checkFileNameConvention,
  detectDecimalComma,
  isEmail,
  isEmpty,
  matchEnum,
  normalizeCode,
  normalizeHeader,
  normalizeText,
  parseBoolean,
  parseDate,
  parseNumber,
} from './normalize';
import type { CatalogName, Cell, ColumnSpec, Issue, ParsedFile, Schema, Sheet, ValidationReport } from './types';

export const MAX_ISSUES = 500;

export type Catalogs = Partial<Record<CatalogName, Set<string>>>;

const CATALOG_TITLES: Record<CatalogName, string> = { practicas: 'Prácticas', insumos: 'Insumos' };

export function pickSheet(file: ParsedFile, schema: Schema): Sheet {
  const wanted = schema.sheetNames.map(normalizeHeader);
  return (
    file.sheets.find((s) => wanted.includes(normalizeHeader(s.name))) ??
    file.sheets.find((s) => !normalizeHeader(s.name).startsWith('instruccion')) ??
    file.sheets[0]
  );
}

function isExampleRow(cells: Cell[]): boolean {
  return cells.some((c) => {
    if (typeof c !== 'string') return false;
    const t = normalizeText(c);
    return t.includes('ejemplo') && t.includes('borrar');
  });
}

type Sink = (issue: Issue) => void;

function checkValue(col: ColumnSpec, v: Cell, line: number, decimalComma: boolean, err: Sink) {
  const text = cellToText(v);
  const at = `Fila ${line}: "${col.label}"`;
  switch (col.type) {
    case 'number': {
      const n = parseNumber(v, decimalComma);
      if (n === null) {
        err({ rule: 'tipo_invalido', row: line, column: col.label, value: text, message: `${at} debe ser un número (valor: "${text}").` });
      } else if (col.min !== undefined && n < col.min) {
        err({ rule: 'fuera_de_rango', row: line, column: col.label, value: text, message: `${at} no puede ser negativo (valor: ${text}).` });
      } else if (col.greaterThan !== undefined && n <= col.greaterThan) {
        err({ rule: 'fuera_de_rango', row: line, column: col.label, value: text, message: `${at} debe ser mayor que ${col.greaterThan} (valor: ${text}).` });
      }
      return;
    }
    case 'date':
      if (parseDate(v) === null) {
        err({ rule: 'tipo_invalido', row: line, column: col.label, value: text, message: `${at} debe ser una fecha válida en formato dd/mm/aaaa (valor: "${text}").` });
      }
      return;
    case 'email':
      if (!isEmail(text)) {
        err({ rule: 'tipo_invalido', row: line, column: col.label, value: text, message: `${at} no es un email válido (valor: "${text}").` });
      }
      return;
    case 'enum': {
      const allowed = col.enumValues ?? [];
      const m = matchEnum(text, allowed);
      if (!m.match) {
        const hint = m.suggestion ? ` ¿Quisiste decir "${m.suggestion}"?` : '';
        err({
          rule: 'valor_no_permitido',
          row: line,
          column: col.label,
          value: text,
          suggestion: m.suggestion,
          message: `${at} tiene "${text}", que no es un valor válido. Valores permitidos: ${allowed.join(', ')}.${hint}`,
        });
      }
      return;
    }
    case 'boolean':
      if (parseBoolean(v) === null) {
        err({ rule: 'valor_no_permitido', row: line, column: col.label, value: text, message: `${at} debe ser "Sí" o "No" (valor: "${text}").` });
      }
      return;
    case 'text':
      return;
  }
}

export function validateFile(file: ParsedFile, schema: Schema, catalogs: Catalogs = {}): ValidationReport {
  const sheet = pickSheet(file, schema);
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  let errorCount = 0;
  let warningCount = 0;
  const err: Sink = (i) => {
    errorCount++;
    if (errors.length < MAX_ISSUES) errors.push(i);
  };
  const warn: Sink = (i) => {
    warningCount++;
    if (warnings.length < MAX_ISSUES) warnings.push(i);
  };

  if (!checkFileNameConvention(file.fileName)) {
    warn({
      rule: 'nombre_archivo',
      message: `El nombre "${file.fileName}" no sigue la convención AAAA-MM-DD_NombreDelDato (por ejemplo 2026-07-15_${schema.title.replace(/\s+/g, '')}.xlsx).`,
    });
  }

  const resolved = resolveHeader(sheet, schema);
  const mapping = mapColumns(resolved.headers, schema);
  mapping.errors.forEach(err);
  mapping.warnings.forEach(warn);

  const dataRows = [];
  for (const row of resolved.rows) {
    if (isExampleRow(row.cells)) {
      err({ rule: 'fila_de_ejemplo', row: row.line, message: `La fila ${row.line} es la fila de ejemplo de la plantilla: borrala antes de enviar el archivo.` });
    } else {
      dataRows.push(row);
    }
  }
  if (dataRows.length === 0) {
    err({ rule: 'archivo_vacio', message: 'El archivo no tiene filas de datos debajo de los encabezados.' });
  }

  const cols = schema.columns.filter((c) => mapping.fixed.has(c.key));
  const cellOf = (cells: Cell[], key: string): Cell => {
    const i = mapping.fixed.get(key);
    return i === undefined ? null : (cells[i] ?? null);
  };
  const labelOf = (key: string) => schema.columns.find((c) => c.key === key)?.label ?? key;
  const decimalComma = new Map(
    cols.filter((c) => c.type === 'number').map((c) => [c.key, detectDecimalComma(dataRows.map((r) => cellOf(r.cells, c.key)))]),
  );
  const dynamicDecimalComma = detectDecimalComma(dataRows.flatMap((r) => mapping.dynamic.map((d) => r.cells[d.index] ?? null)));

  const seen = new Map<string, Map<string, number>>();
  const checkUnique = (key: string, label: string, normalized: string, display: string, line: number) => {
    const values = seen.get(key) ?? new Map<string, number>();
    seen.set(key, values);
    const first = values.get(normalized);
    if (first !== undefined) {
      err({ rule: 'duplicado', row: line, column: label, value: display, message: `Fila ${line}: "${display}" está repetido en "${label}" (ya aparece en la fila ${first}).` });
    } else {
      values.set(normalized, line);
    }
  };

  for (const { line, cells } of dataRows) {
    for (const col of cols) {
      const v = cellOf(cells, col.key);
      if (isEmpty(v)) {
        if (col.level === 'required') {
          err({ rule: 'celda_vacia', row: line, column: col.label, message: `Fila ${line}: "${col.label}" está vacío y es obligatorio.` });
        }
        continue;
      }
      checkValue(col, v, line, decimalComma.get(col.key) ?? false, err);
      if (col.unique) checkUnique(col.key, col.label, normalizeCode(v), cellToText(v), line);
    }

    if (schema.dynamic) {
      const dyn = schema.dynamic;
      mapping.dynamic.forEach((d, idx) => {
        const v = cells[d.index] ?? null;
        if (isEmpty(v)) {
          if (dyn.firstRequired && idx === 0) {
            err({ rule: 'celda_vacia', row: line, column: d.header, message: `Fila ${line}: "${d.header}" está vacío; la primera columna de arancel es obligatoria.` });
          }
          return;
        }
        const text = cellToText(v);
        const n = parseNumber(v, dynamicDecimalComma);
        if (n === null) {
          err({ rule: 'tipo_invalido', row: line, column: d.header, value: text, message: `Fila ${line}: "${d.header}" debe ser un número (valor: "${text}").` });
        } else if (n < dyn.min) {
          err({ rule: 'fuera_de_rango', row: line, column: d.header, value: text, message: `Fila ${line}: "${d.header}" no puede ser negativo (valor: ${text}).` });
        }
      });
    }

    for (const [a, b] of schema.uniquePairs ?? []) {
      const va = cellOf(cells, a);
      const vb = cellOf(cells, b);
      if (isEmpty(va) || isEmpty(vb)) continue;
      checkUnique(`${a}|${b}`, `${labelOf(a)} + ${labelOf(b)}`, `${normalizeCode(va)}|${normalizeCode(vb)}`, `${cellToText(va)} / ${cellToText(vb)}`, line);
    }

    if (schema.distinctPair) {
      const [a, b] = schema.distinctPair;
      const va = cellOf(cells, a);
      const vb = cellOf(cells, b);
      if (!isEmpty(va) && !isEmpty(vb) && normalizeCode(va) === normalizeCode(vb)) {
        err({ rule: 'fuera_de_rango', row: line, column: labelOf(b), value: cellToText(vb), message: `Fila ${line}: "${labelOf(a)}" y "${labelOf(b)}" no pueden ser el mismo código (${cellToText(va)}).` });
      }
    }
  }

  for (const ref of schema.catalogRefs ?? []) {
    if (!mapping.fixed.has(ref.column)) continue;
    const label = labelOf(ref.column);
    const catalog = catalogs[ref.catalog];
    if (!catalog) {
      warn({ rule: 'catalogo_no_verificado', column: label, message: `No pude verificar "${label}" contra el catálogo de ${CATALOG_TITLES[ref.catalog]} porque todavía no se validó ese archivo.` });
      continue;
    }
    const missing = new Map<string, number>();
    for (const { line, cells } of dataRows) {
      const v = cellOf(cells, ref.column);
      if (isEmpty(v) || catalog.has(normalizeCode(v))) continue;
      const code = cellToText(v);
      if (!missing.has(code)) missing.set(code, line);
    }
    for (const [code, line] of missing) {
      warn({ rule: 'codigo_no_en_catalogo', row: line, column: label, value: code, message: `Fila ${line}: el código "${code}" de "${label}" no está en el catálogo de ${CATALOG_TITLES[ref.catalog]} validado.` });
    }
  }

  return {
    fileName: file.fileName,
    schemaId: schema.id,
    schemaTitle: schema.title,
    sheetName: sheet.name,
    ok: errorCount === 0,
    rows: dataRows.length,
    errorCount,
    warningCount,
    errors,
    warnings,
    dynamicColumns: schema.dynamic ? mapping.dynamic.map((d) => d.header) : undefined,
  };
}

export function extractCatalog(file: ParsedFile, schema: Schema): string[] | undefined {
  if (!schema.providesCatalog) return undefined;
  const resolved = resolveHeader(pickSheet(file, schema), schema);
  const index = mapColumns(resolved.headers, schema).fixed.get(schema.providesCatalog.column);
  if (index === undefined) return [];
  const codes = new Set<string>();
  for (const { cells } of resolved.rows) {
    const v = cells[index] ?? null;
    if (!isEmpty(v) && !isExampleRow(cells)) codes.add(normalizeCode(v));
  }
  return [...codes];
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/validation/validate.test.ts`
Esperado: PASS. Si algún orden de errores no coincide, revisá que el orden de iteración sea por fila → columnas fijas → dinámicas → pares → `distinctPair`, que es el que asumen los tests.

- [ ] **Step 5: Commit**

```bash
git add lib/validation/validate.ts test/validation/validate.test.ts
git commit -m "feat(validation): reglas por fila, duplicados, catálogos y reporte

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Detección del tipo de archivo

**Files:**
- Create: `lib/validation/detect.ts`
- Test: `test/validation/detect.test.ts`

**Interfaces:**
- Consume: `SCHEMAS`, `getSchema` (Task 4); `headerMatches`, `HEADER_SEARCH_ROWS` (Task 5); `normalizeText`, `cellToText` (Task 2).
- Produce: `type Detection = { kind: 'ok'; schema: Schema; via: 'tipo' | 'nombre' | 'encabezados' } | { kind: 'ambiguo'; candidates: Schema[] } | { kind: 'desconocido' }`, `detectSchema(file: ParsedFile, tipo?: StepId): Detection`, `fileKey(name: string): string`.

- [ ] **Step 1: Escribir los tests que fallan**

`test/validation/detect.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { detectSchema, fileKey } from '@/lib/validation/detect';
import { parsed } from '../helpers';

const id = (d: ReturnType<typeof detectSchema>) => (d.kind === 'ok' ? d.schema.id : d.kind);

describe('fileKey', () => {
  it('normaliza el nombre sin extensión', () => {
    expect(fileKey('2026-07-15_Relaciones de Consumo.xlsx')).toBe('20260715relacionesdeconsumo');
  });
});

describe('detectSchema', () => {
  it('respeta el tipo explícito', () => {
    expect(detectSchema(parsed('x.xlsx', [['a']]), 'sedes')).toMatchObject({ kind: 'ok', via: 'tipo' });
  });

  it.each([
    ['2026-07-15_Usuarios.xlsx', 'usuarios'],
    ['Template_Relaciones_Consumo_Optacost sueros e INM completos.xlsx', 'relaciones_consumo'],
    ['Template_Practicas_Relacionadas_Optacost.xlsx', 'practicas_compuestas'],
    ['Template_Practicas_Optacost.xlsx', 'practicas'],
    ['Template_Modulos_Obra_Social_Optacost.xlsx', 'modulos_obra_social'],
    ['2026-07-15_Obras Sociales.csv', 'obras_sociales'],
    ['Template_Lista_Precios_Competencia_Optacost.xlsx', 'precios_competencia'],
    ['facturacion por sedes julio.xlsx', 'facturacion'],
  ])('por nombre: %s → %s', (name, expected) => {
    expect(id(detectSchema(parsed(name, [['x']])))).toBe(expected);
  });

  it('por encabezados cuando el nombre no dice nada', () => {
    const d = detectSchema(parsed('export.csv', [['Código', 'Nombre', 'Valor UB'], ['1', 'OSDE', 10]]));
    expect(d).toMatchObject({ kind: 'ok', via: 'encabezados' });
    expect(id(d)).toBe('obras_sociales');
  });

  it('desempata por cantidad de columnas reconocidas (facturación vs sedes)', () => {
    const header = ['Código de práctica', 'Nombre de práctica', 'Código de convenio', 'Nombre de convenio', 'Sede', 'Cantidad facturada', 'Bruto facturado'];
    expect(id(detectSchema(parsed('export.csv', [header, ['1', 'X', 'C', 'OS', 'Centro', 1, 10]])))).toBe('facturacion');
  });

  it('ambiguo cuando dos esquemas empatan', () => {
    const d = detectSchema(parsed('export.csv', [['Código', 'Nombre'], ['1', 'X']]));
    expect(d.kind).toBe('ambiguo');
    if (d.kind === 'ambiguo') expect(d.candidates.map((s) => s.id).sort()).toEqual(['convenios', 'obras_sociales']);
  });

  it('desconocido cuando nada coincide', () => {
    expect(id(detectSchema(parsed('export.csv', [['foo', 'bar']])))).toBe('desconocido');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/validation/detect.test.ts`
Esperado: FAIL, "Failed to resolve import '@/lib/validation/detect'".

- [ ] **Step 3: Implementar `lib/validation/detect.ts`**

```ts
import { HEADER_SEARCH_ROWS, headerMatches } from './columns';
import { cellToText, normalizeText } from './normalize';
import { SCHEMAS, getSchema } from './schemas';
import type { ParsedFile, Schema, Sheet, StepId } from './types';

export type Detection =
  | { kind: 'ok'; schema: Schema; via: 'tipo' | 'nombre' | 'encabezados' }
  | { kind: 'ambiguo'; candidates: Schema[] }
  | { kind: 'desconocido' };

const MIN_SCORE = 0.6;
const TIE_MARGIN = 0.1;

const FILE_KEYS = SCHEMAS.flatMap((schema) => schema.fileNameKeys.map((key) => ({ key, schema }))).sort(
  (a, b) => b.key.length - a.key.length,
);

export function fileKey(name: string): string {
  return normalizeText(name.replace(/\.[^.]+$/, '')).replace(/[^a-z0-9]/g, '');
}

/** Proporción de columnas obligatorias reconocidas (score) y cuántas son (found), en la mejor fila candidata. */
function headerScore(sheet: Sheet, schema: Schema): { score: number; found: number } {
  const required = schema.columns.filter((c) => c.level === 'required');
  let best = { score: 0, found: 0 };
  for (const row of sheet.lines.slice(0, HEADER_SEARCH_ROWS)) {
    const headers = row.cells.map((c) => cellToText(c));
    const found = required.filter((c) => headers.some((h) => headerMatches(h, c))).length;
    const score = found / required.length;
    if (score > best.score || (score === best.score && found > best.found)) best = { score, found };
  }
  return best;
}

export function detectSchema(file: ParsedFile, tipo?: StepId): Detection {
  if (tipo) return { kind: 'ok', schema: getSchema(tipo), via: 'tipo' };

  const key = fileKey(file.fileName);
  const byName = FILE_KEYS.find((e) => key.includes(e.key));
  if (byName) return { kind: 'ok', schema: byName.schema, via: 'nombre' };

  const scored = SCHEMAS.map((schema) => {
    const perSheet = file.sheets.map((sheet) => headerScore(sheet, schema));
    const best = perSheet.reduce((a, b) => (b.score > a.score || (b.score === a.score && b.found > a.found) ? b : a));
    return { schema, ...best };
  })
    .filter((x) => x.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || b.found - a.found);
  if (scored.length === 0) return { kind: 'desconocido' };
  // Empate en score: gana el esquema con más columnas obligatorias reconocidas (Facturación con 7 le gana a Sedes con 1).
  const close = scored.filter((x) => scored[0].score - x.score < TIE_MARGIN);
  const maxFound = Math.max(...close.map((x) => x.found));
  const top = close.filter((x) => x.found === maxFound);
  if (top.length > 1) return { kind: 'ambiguo', candidates: top.map((x) => x.schema) };
  return { kind: 'ok', schema: top[0].schema, via: 'encabezados' };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run test/validation/detect.test.ts`
Esperado: PASS. En el caso "ambiguo" (encabezados Código y Nombre), `costos_indirectos` y `precios_competencia` quedan por debajo de 0,6 y se filtran, así que los candidatos son convenios y obras_sociales: 0,67 y 2 columnas cada uno.

- [ ] **Step 5: Commit**

```bash
git add lib/validation/detect.ts test/validation/detect.test.ts
git commit -m "feat(validation): detección del tipo de archivo por nombre y encabezados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Store de archivos, progreso y pasos

**Files:**
- Create: `lib/files/store.ts`, `lib/onboarding/lab.ts`, `lib/onboarding/state.ts`, `lib/onboarding/steps.ts`
- Test: `test/files/store.test.ts`, `test/onboarding/state.test.ts`

**Interfaces:**
- Consume: `ParsedFile`, `StepId`, `STEP_IDS`, `CatalogName`, `Category` (Task 2); `SCHEMAS`, `getSchema` (Task 4); `Catalogs` (Task 6).
- Produce (`store.ts`): `FILE_TTL_MS`, `class FileStore { constructor(now?: () => number, ttlMs?: number); put(file: ParsedFile): string; get(id: string): ParsedFile | undefined }`, `fileStore: FileStore` (singleton en `globalThis`).
- Produce (`lab.ts`): `LAB_ID: RegExp`, `DEFAULT_LAB = 'labmedicina'`.
- Produce (`state.ts`): `StepStatus = 'pendiente' | 'con_errores' | 'validado' | 'completo'`, `StepState`, `LabProgress`, `emptyProgress(lab)`, `class ProgressStore { constructor(dir: string, now?: () => Date); load(lab): Promise<LabProgress>; recordValidation(lab, step, r: { fileName: string; ok: boolean; errorCount: number; warningCount: number }, catalog?: { name: CatalogName; codes: string[] }): Promise<LabProgress>; markComplete(lab, step): Promise<{ ok: true; progress: LabProgress } | { ok: false; reason: string }>; catalogs(lab): Promise<Catalogs> }`, `getProgressStore(): ProgressStore` (usa `process.env.ONBOARDING_DIR` o `<cwd>/.onboarding`).
- Produce (`steps.ts`): `CATEGORY_TITLES`, `StepInfo = { id; title; category; categoryTitle; templateFile; requiredColumns: string[]; optionalColumns: string[]; dynamicHint?: string }`, `STEPS: StepInfo[]`, `StepView = { id: StepId; titulo: string; categoria: Category; categoriaTitulo: string; estado: StepStatus; ultimoArchivo: string | null; errores: number | null }`, `progressView(p): { lab: string; pasos: StepView[]; completos: number; total: number }`, `nextPendingStep(p): StepInfo | null`.

- [ ] **Step 1: Escribir los tests que fallan**

`test/files/store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FileStore } from '@/lib/files/store';
import { parsed } from '../helpers';

describe('FileStore', () => {
  it('guarda y devuelve por id hasta que vence', () => {
    let now = 1_000;
    const store = new FileStore(() => now, 100);
    const id = store.put(parsed('a.csv', [['x']]));
    expect(id).toMatch(/^f_[a-z0-9]{12}$/);
    expect(store.get(id)?.fileName).toBe('a.csv');
    now = 1_099;
    expect(store.get(id)).toBeDefined();
    now = 1_100;
    expect(store.get(id)).toBeUndefined();
  });

  it('id inexistente → undefined', () => {
    expect(new FileStore().get('f_nada')).toBeUndefined();
  });
});
```

`test/onboarding/state.test.ts`:

```ts
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProgressStore } from '@/lib/onboarding/state';
import { nextPendingStep, progressView } from '@/lib/onboarding/steps';

let dir: string;
let store: ProgressStore;
const ok = { fileName: '2026-07-15_Usuarios.xlsx', ok: true, errorCount: 0, warningCount: 1 };
const bad = { fileName: '2026-07-15_Usuarios.xlsx', ok: false, errorCount: 3, warningCount: 0 };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onb-'));
  store = new ProgressStore(dir, () => new Date('2026-10-09T12:00:00Z'));
});

describe('ProgressStore', () => {
  it('arranca con todos los pasos pendientes', async () => {
    const p = await store.load('labmedicina');
    expect(Object.values(p.steps).every((s) => s.status === 'pendiente')).toBe(true);
    expect(nextPendingStep(p)?.id).toBe('usuarios');
  });

  it('registra validaciones y persiste en disco', async () => {
    await store.recordValidation('labmedicina', 'usuarios', bad);
    expect((await store.load('labmedicina')).steps.usuarios).toMatchObject({ status: 'con_errores', errors: 3 });
    await store.recordValidation('labmedicina', 'usuarios', ok);
    const raw = JSON.parse(await readFile(join(dir, 'labmedicina.json'), 'utf8'));
    expect(raw.steps.usuarios).toMatchObject({ status: 'validado', lastFile: ok.fileName, validatedAt: '2026-10-09T12:00:00.000Z' });
  });

  it('marcar completo exige una validación OK', async () => {
    const r1 = await store.markComplete('labmedicina', 'usuarios');
    expect(r1).toMatchObject({ ok: false });
    await store.recordValidation('labmedicina', 'usuarios', bad);
    const r2 = await store.markComplete('labmedicina', 'usuarios');
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toContain('3 errores');
    await store.recordValidation('labmedicina', 'usuarios', ok);
    const r3 = await store.markComplete('labmedicina', 'usuarios');
    expect(r3.ok).toBe(true);
    if (r3.ok) expect(nextPendingStep(r3.progress)?.id).toBe('sedes');
  });

  it('revalidar OK un paso completo lo mantiene completo; con errores lo baja', async () => {
    await store.recordValidation('labmedicina', 'usuarios', ok);
    await store.markComplete('labmedicina', 'usuarios');
    await store.recordValidation('labmedicina', 'usuarios', ok);
    expect((await store.load('labmedicina')).steps.usuarios.status).toBe('completo');
    await store.recordValidation('labmedicina', 'usuarios', bad);
    expect((await store.load('labmedicina')).steps.usuarios.status).toBe('con_errores');
  });

  it('guarda catálogos solo de validaciones OK', async () => {
    await store.recordValidation('labmedicina', 'practicas', { ...bad, fileName: 'p.xlsx' }, { name: 'practicas', codes: ['1'] });
    expect((await store.catalogs('labmedicina')).practicas).toBeUndefined();
    await store.recordValidation('labmedicina', 'practicas', { ...ok, fileName: 'p.xlsx' }, { name: 'practicas', codes: ['1', '2'] });
    expect([...((await store.catalogs('labmedicina')).practicas ?? [])]).toEqual(['1', '2']);
  });

  it('serializa escrituras concurrentes', async () => {
    await Promise.all([
      store.recordValidation('labmedicina', 'usuarios', ok),
      store.recordValidation('labmedicina', 'sedes', ok),
      store.recordValidation('labmedicina', 'sectores', ok),
    ]);
    const p = await store.load('labmedicina');
    expect([p.steps.usuarios.status, p.steps.sedes.status, p.steps.sectores.status]).toEqual(['validado', 'validado', 'validado']);
  });

  it('rechaza ids de laboratorio inválidos', async () => {
    await expect(store.load('../etc')).rejects.toThrow('inválido');
  });

  it('JSON corrupto: lo renombra y arranca vacío (Review Focus 5)', async () => {
    await writeFile(join(dir, 'labmedicina.json'), '{ "lab": "labmed');
    const p = await store.load('labmedicina');
    expect(p.steps.usuarios.status).toBe('pendiente');
    expect((await readdir(dir)).some((f) => f.startsWith('labmedicina.json.corrupto-'))).toBe(true);
  });
});

describe('progressView', () => {
  it('lista los 14 pasos con categoría y conteo', async () => {
    await store.recordValidation('labmedicina', 'usuarios', ok);
    await store.markComplete('labmedicina', 'usuarios');
    const v = progressView(await store.load('labmedicina'));
    expect(v.total).toBe(14);
    expect(v.completos).toBe(1);
    expect(v.pasos[0]).toMatchObject({ id: 'usuarios', categoria: '01', categoriaTitulo: 'Estructura y equipo', estado: 'completo' });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/files test/onboarding`
Esperado: FAIL, módulos inexistentes.

- [ ] **Step 3: Implementar `lib/files/store.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type { ParsedFile } from '@/lib/validation/types';

export const FILE_TTL_MS = 60 * 60 * 1000;

export class FileStore {
  private files = new Map<string, { file: ParsedFile; expiresAt: number }>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = FILE_TTL_MS,
  ) {}

  put(file: ParsedFile): string {
    this.sweep();
    const id = `f_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    this.files.set(id, { file, expiresAt: this.now() + this.ttlMs });
    return id;
  }

  get(id: string): ParsedFile | undefined {
    const entry = this.files.get(id);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.files.delete(id);
      return undefined;
    }
    return entry.file;
  }

  private sweep() {
    const t = this.now();
    for (const [id, e] of this.files) if (e.expiresAt <= t) this.files.delete(id);
  }
}

// En `next dev` los módulos se recargan: el singleton vive en globalThis para no perder los archivos.
const g = globalThis as unknown as { __onboardingFileStore?: FileStore };
export const fileStore = (g.__onboardingFileStore ??= new FileStore());
```

- [ ] **Step 4: Implementar `lib/onboarding/lab.ts`**

```ts
export const LAB_ID = /^[a-z0-9-]{1,40}$/;
export const DEFAULT_LAB = 'labmedicina';
```

- [ ] **Step 5: Implementar `lib/onboarding/state.ts`**

```ts
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
```

- [ ] **Step 6: Implementar `lib/onboarding/steps.ts`**

```ts
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
```

- [ ] **Step 7: Correr y verificar que pasa**

Run: `npx vitest run test/files test/onboarding`
Esperado: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/files lib/onboarding test/files test/onboarding
git commit -m "feat(onboarding): store de archivos con TTL y progreso persistido por laboratorio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Tools locales (`validar_archivo`, `ver_progreso`, `marcar_paso`)

**Files:**
- Create: `lib/tools/validate.ts`, `lib/tools/progress.ts`
- Test: `test/tools/tools.test.ts`

**Interfaces:**
- Consume: `FileStore` (Task 8), `ProgressStore` (Task 8), `detectSchema` (Task 7), `validateFile`, `extractCatalog` (Task 6), `progressView`, `nextPendingStep`, `StepInfo` (Task 8), `STEP_IDS`, `ValidationReport` (Task 2).
- Produce (`validate.ts`): `MODEL_MAX_ERRORS = 20`, `MODEL_MAX_WARNINGS = 10`, `type ValidateOutput = { status: 'validado'; report: ValidationReport } | { status: 'ambiguo'; candidatos: { id: StepId; titulo: string }[]; mensaje: string } | { status: 'desconocido'; mensaje: string } | { status: 'expirado'; mensaje: string }`, `type ToolDeps = { files: FileStore; progress: ProgressStore; lab: string }`, `runValidation(deps, input: { fileId: string; tipo?: StepId }): Promise<ValidateOutput>`, `summarizeForModel(out: ValidateOutput): object`, `createValidateTool(deps)`.
- Produce (`progress.ts`): `createProgressTools(deps: { progress: ProgressStore; lab: string }): { ver_progreso; marcar_paso }`, `stepBrief(s: StepInfo | null)`.

- [ ] **Step 1: Escribir los tests que fallan**

`test/tools/tools.test.ts`:

```ts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { FileStore } from '@/lib/files/store';
import { ProgressStore } from '@/lib/onboarding/state';
import { createProgressTools } from '@/lib/tools/progress';
import { runValidation, summarizeForModel } from '@/lib/tools/validate';
import { parsed } from '../helpers';

let files: FileStore;
let progress: ProgressStore;
const lab = 'prueba';
const opts = { toolCallId: 't1', messages: [] };

beforeEach(async () => {
  files = new FileStore();
  progress = new ProgressStore(await mkdtemp(join(tmpdir(), 'tools-')));
});

describe('runValidation', () => {
  it('valida, registra el progreso y guarda el catálogo', async () => {
    const id = files.put(parsed('2026-07-15_Practicas.xlsx', [['Código de práctica', 'Nombre de práctica', 'Derivación'], ['45', 'Hemograma', 10]]));
    const out = await runValidation({ files, progress, lab }, { fileId: id });
    expect(out).toMatchObject({ status: 'validado', report: { ok: true, schemaId: 'practicas' } });
    expect((await progress.load(lab)).steps.practicas.status).toBe('validado');
    expect([...((await progress.catalogs(lab)).practicas ?? [])]).toEqual(['45']);
  });

  it('usa el catálogo validado en archivos posteriores', async () => {
    await progress.recordValidation(lab, 'practicas', { fileName: 'p', ok: true, errorCount: 0, warningCount: 0 }, { name: 'practicas', codes: ['45'] });
    const id = files.put(parsed('2026-07-15_Facturacion.xlsx', [
      ['Código de práctica', 'Nombre de práctica', 'Código de convenio', 'Nombre de convenio', 'Sede', 'Cantidad facturada', 'Bruto facturado'],
      ['99', 'X', 'C1', 'OSDE', 'Centro', 3, 100],
    ]));
    const out = await runValidation({ files, progress, lab }, { fileId: id });
    if (out.status !== 'validado') throw new Error(out.status);
    expect(out.report.warnings.map((w) => w.rule)).toEqual(['codigo_no_en_catalogo']);
  });

  it('archivo expirado, ambiguo y desconocido', async () => {
    expect((await runValidation({ files, progress, lab }, { fileId: 'f_nada' })).status).toBe('expirado');
    const amb = files.put(parsed('export.csv', [['Código', 'Nombre'], ['1', 'X']]));
    const outAmb = await runValidation({ files, progress, lab }, { fileId: amb });
    expect(outAmb.status).toBe('ambiguo');
    const unk = files.put(parsed('export.csv', [['foo'], ['1']]));
    expect((await runValidation({ files, progress, lab }, { fileId: unk })).status).toBe('desconocido');
    const forced = await runValidation({ files, progress, lab }, { fileId: amb, tipo: 'convenios' });
    expect(forced).toMatchObject({ status: 'validado', report: { schemaId: 'convenios' } });
  });
});

describe('summarizeForModel', () => {
  it('trunca errores y advertencias para el modelo', async () => {
    const rows = [['Nombre completo', 'Email', 'Rol'], ...Array.from({ length: 30 }, (_, i) => [`U${i}`, '', 'Editor'])];
    const id = files.put(parsed('2026-07-15_Usuarios.xlsx', rows));
    const s = summarizeForModel(await runValidation({ files, progress, lab }, { fileId: id })) as {
      totalErrores: number;
      errores: unknown[];
    };
    expect(s.totalErrores).toBe(30);
    expect(s.errores).toHaveLength(20);
  });
});

describe('herramientas de progreso', () => {
  it('marcar_paso rechaza sin validación OK y acepta con ella', async () => {
    const tools = createProgressTools({ progress, lab });
    const r1 = await tools.marcar_paso.execute!({ paso: 'usuarios' }, opts);
    expect(r1).toMatchObject({ ok: false });
    await progress.recordValidation(lab, 'usuarios', { fileName: 'u', ok: true, errorCount: 0, warningCount: 0 });
    const r2 = await tools.marcar_paso.execute!({ paso: 'usuarios' }, opts);
    expect(r2).toMatchObject({ ok: true, siguiente: { id: 'sedes' } });
  });

  it('ver_progreso devuelve los 14 pasos y el siguiente', async () => {
    const tools = createProgressTools({ progress, lab });
    const r = (await tools.ver_progreso.execute!({}, opts)) as { total: number; siguiente: { id: string } };
    expect(r.total).toBe(14);
    expect(r.siguiente.id).toBe('usuarios');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/tools/tools.test.ts`
Esperado: FAIL, módulos inexistentes.

- [ ] **Step 3: Implementar `lib/tools/validate.ts`**

```ts
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
```

- [ ] **Step 4: Implementar `lib/tools/progress.ts`**

```ts
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
        'Marca un paso como completo. Solo funciona si el último archivo validado de ese paso no tuvo errores; si falla, explicale al usuario el motivo.',
      inputSchema: z.object({ paso: z.enum(STEP_IDS) }),
      execute: async ({ paso }) => {
        const r = await deps.progress.markComplete(deps.lab, paso);
        if (!r.ok) return { ok: false, mensaje: r.reason };
        return { ok: true, mensaje: `Paso "${getSchema(paso).title}" completo.`, siguiente: stepBrief(nextPendingStep(r.progress)) };
      },
    }),
  };
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npx vitest run test/tools/tools.test.ts && npm run typecheck`
Esperado: PASS y `tsc` sin errores. Si `tool(...).execute!(input, opts)` se queja del tipo de `opts`, castear con `opts as never` solo en el test.

- [ ] **Step 6: Commit**

```bash
git add lib/tools test/tools
git commit -m "feat(tools): validar_archivo, ver_progreso y marcar_paso

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Agente (modelo con fallback, MCP, prompt y stream)

**Files:**
- Create: `lib/agent/model.ts`, `lib/agent/prompt.ts`, `lib/agent/run.ts`, `lib/tools/mcp.ts`
- Test: `test/agent/model.test.ts`, `test/agent/mcp.test.ts`, `test/agent/prompt.test.ts`, `test/agent/run.test.ts`

**Interfaces:**
- Consume: `STEPS` (Task 8).
- Produce (`model.ts`): `isRateLimit(e: unknown): boolean`, `withFallback(primary, fallback)` (modelo envuelto), `getModel(env?): LanguageModel`.
- Produce (`mcp.ts`): `DEFAULT_MCP_URL`, `DOCS_TOOL_SCHEMAS`, `SKILL_URI`, `type DocsConnection = { tools: ToolSet; skill?: string; available: boolean; close: () => Promise<void> }`, `connectDocs(url: string, create?: typeof createMCPClient): Promise<DocsConnection>`, `resetSkillCache()`.
- Produce (`prompt.ts`): `DOCS_BASE_URL`, `buildInstructions(opts: { skill?: string; docsAvailable: boolean; lab: string }): string`.
- Produce (`run.ts`): `type AgentDeps = { model: LanguageModel; tools: ToolSet; instructions: string; docsAvailable: boolean; onEnd?: () => Promise<void> | void; maxRetries?: number }`, `streamAgentResponse(messages: UIMessage[], deps: AgentDeps): Promise<Response>`, `friendlyError(error: unknown): string`.

- [ ] **Step 1: Escribir los tests que fallan**

Helper de mocks dentro de `test/agent/mock-model.ts`:

```ts
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

export function textStream(text: string) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'text-start' as const, id: 't1' },
        { type: 'text-delta' as const, id: 't1', delta: text },
        { type: 'text-end' as const, id: 't1' },
        { type: 'finish' as const, finishReason: { unified: 'stop' as const, raw: undefined }, logprobs: undefined, usage },
      ],
    }),
  };
}

export function toolCallStream(toolName: string, input: object) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'tool-call' as const, toolCallId: 'c1', toolName, input: JSON.stringify(input) },
        { type: 'finish' as const, finishReason: { unified: 'tool-calls' as const, raw: undefined }, logprobs: undefined, usage },
      ],
    }),
  };
}

/** Modelo que devuelve un stream distinto en cada llamada. */
export function scriptedModel(...steps: (() => ReturnType<typeof textStream>)[]) {
  let i = 0;
  return new MockLanguageModelV4({ doStream: async () => steps[Math.min(i++, steps.length - 1)]() });
}
```

`test/agent/model.test.ts`:

```ts
import { APICallError, streamText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { getModel, isRateLimit, withFallback } from '@/lib/agent/model';
import { textStream } from './mock-model';

const apiError = (statusCode: number) =>
  new APICallError({ message: `HTTP ${statusCode}`, url: 'https://x', requestBodyValues: {}, statusCode, isRetryable: true });

async function textOf(model: Parameters<typeof streamText>[0]['model']) {
  const r = streamText({ model, prompt: 'hola', maxRetries: 0 });
  let out = '';
  for await (const p of r.stream) {
    if (p.type === 'text-delta') out += p.text;
    if (p.type === 'error') throw p.error;
  }
  return out;
}

describe('withFallback', () => {
  it('usa el modelo de respaldo ante un 429', async () => {
    const primary = new MockLanguageModelV4({ doStream: async () => { throw apiError(429); } });
    const fallback = new MockLanguageModelV4({ doStream: async () => textStream('desde respaldo') });
    expect(await textOf(withFallback(primary, fallback))).toBe('desde respaldo');
  });

  it('no usa el respaldo ante otros errores', async () => {
    const primary = new MockLanguageModelV4({ doStream: async () => { throw apiError(500); } });
    const fallback = new MockLanguageModelV4({ doStream: async () => textStream('no') });
    await expect(textOf(withFallback(primary, fallback))).rejects.toThrow('HTTP 500');
  });
});

describe('isRateLimit / getModel', () => {
  it('detecta 429', () => {
    expect(isRateLimit(apiError(429))).toBe(true);
    expect(isRateLimit(apiError(400))).toBe(false);
    expect(isRateLimit(new Error('x'))).toBe(false);
  });
  it('exige GEMINI_API_KEY', () => {
    expect(() => getModel({})).toThrow('GEMINI_API_KEY');
    expect(getModel({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-flash-lite-latest' }).modelId).toBe('gemini-flash-lite-latest');
  });
});
```

En `textOf`, si `p.text` no existe en v7 para `text-delta`, usar `p.text ?? (p as { delta?: string }).delta`. La prueba descartable mostró que el texto llega; verificar el nombre del campo con `tsc`.

`test/agent/mcp.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectDocs, resetSkillCache, SKILL_URI } from '@/lib/tools/mcp';

type Factory = NonNullable<Parameters<typeof connectDocs>[1]>;

beforeEach(() => resetSkillCache());

describe('connectDocs', () => {
  it('pide solo las tools permitidas y lee el resource de skill', async () => {
    const client = {
      tools: vi.fn(async () => ({ search_optacost: {}, query_docs_filesystem_optacost: {} })),
      readResource: vi.fn(async () => ({ contents: [{ uri: SKILL_URI, text: 'GUIA OPTACOST' }] })),
      close: vi.fn(async () => {}),
    };
    const create = vi.fn(async () => client) as unknown as Factory;
    const docs = await connectDocs('https://docs.test/mcp', create);
    expect(docs.available).toBe(true);
    expect(docs.skill).toBe('GUIA OPTACOST');
    const schemas = (client.tools.mock.calls[0] as unknown as [{ schemas: Record<string, unknown> }])[0].schemas;
    expect(Object.keys(schemas).sort()).toEqual(['query_docs_filesystem_optacost', 'search_optacost']);
    expect(Object.keys(schemas)).not.toContain('submit_feedback');
    await docs.close();
    expect(client.close).toHaveBeenCalled();
  });

  it('cachea el resource entre conexiones', async () => {
    const client = { tools: vi.fn(async () => ({})), readResource: vi.fn(async () => ({ contents: [{ uri: SKILL_URI, text: 'S' }] })), close: vi.fn(async () => {}) };
    const create = vi.fn(async () => client) as unknown as Factory;
    await connectDocs('u', create);
    await connectDocs('u', create);
    expect(client.readResource).toHaveBeenCalledTimes(1);
  });

  it('si el MCP falla devuelve available=false sin tools', async () => {
    const create = vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as unknown as Factory;
    const docs = await connectDocs('u', create);
    expect(docs).toMatchObject({ available: false, tools: {} });
  });
});
```

`test/agent/prompt.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildInstructions } from '@/lib/agent/prompt';
import { STEPS } from '@/lib/onboarding/steps';

describe('buildInstructions', () => {
  it('incluye los 14 pasos, la convención de adjuntos y la skill', () => {
    const s = buildInstructions({ docsAvailable: true, lab: 'labmedicina', skill: 'GUIA-XYZ' });
    for (const step of STEPS) expect(s).toContain(step.title);
    expect(s).toContain('fileId');
    expect(s).toContain('GUIA-XYZ');
    expect(s).toContain('https://www.optacost.com/docs');
    expect(s).not.toContain('no está disponible');
  });
  it('avisa cuando la documentación no está disponible', () => {
    expect(buildInstructions({ docsAvailable: false, lab: 'x' })).toContain('no está disponible');
  });
});
```

`test/agent/run.test.ts`:

```ts
import { APICallError, tool, type UIMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { friendlyError, streamAgentResponse } from '@/lib/agent/run';
import { scriptedModel, textStream, toolCallStream } from './mock-model';

const userMessage: UIMessage[] = [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: '¿cómo voy?' }] }];

describe('streamAgentResponse', () => {
  it('ejecuta la tool pedida y responde con texto', async () => {
    let called = 0;
    const tools = {
      ver_progreso: tool({ inputSchema: z.object({}), execute: async () => { called++; return { completos: 3 }; } }),
    };
    const model = scriptedModel(() => toolCallStream('ver_progreso', {}), () => textStream('Vas 3 de 14.'));
    const res = await streamAgentResponse(userMessage, { model, tools, instructions: 'x', docsAvailable: true, maxRetries: 0 });
    const body = await res.text();
    expect(called).toBe(1);
    expect(body).toContain('tool-output-available');
    expect(body).toContain('Vas 3 de 14.');
    expect(body).toContain('"docsAvailable":true');
  });

  it('convierte un 429 en un mensaje amigable', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new APICallError({ message: 'quota', url: 'u', requestBodyValues: {}, statusCode: 429, isRetryable: true });
      },
    });
    const res = await streamAgentResponse(userMessage, { model, tools: {}, instructions: 'x', docsAvailable: true, maxRetries: 0 });
    expect(await res.text()).toContain('límite gratuito de Gemini');
  });
});

describe('friendlyError', () => {
  it('mensajes por tipo de error', () => {
    expect(friendlyError(new Error('x'))).toContain('error inesperado');
    expect(friendlyError(new APICallError({ message: 'm', url: 'u', requestBodyValues: {}, statusCode: 503 }))).toContain('no está respondiendo');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/agent`
Esperado: FAIL, módulos inexistentes.

- [ ] **Step 3: Implementar `lib/agent/model.ts`**

```ts
import { createGoogle } from '@ai-sdk/google';
import { APICallError, wrapLanguageModel } from 'ai';

type WrappableModel = Parameters<typeof wrapLanguageModel>[0]['model'];

export function isRateLimit(e: unknown): boolean {
  return APICallError.isInstance(e) && e.statusCode === 429;
}

/** Si el modelo principal responde 429 (límite del free tier), reintenta con el de respaldo. */
export function withFallback(primary: WrappableModel, fallback: WrappableModel) {
  return wrapLanguageModel({
    model: primary,
    middleware: {
      specificationVersion: 'v4',
      wrapGenerate: async ({ doGenerate, params }) => {
        try {
          return await doGenerate();
        } catch (e) {
          if (isRateLimit(e)) return fallback.doGenerate(params);
          throw e;
        }
      },
      wrapStream: async ({ doStream, params }) => {
        try {
          return await doStream();
        } catch (e) {
          if (isRateLimit(e)) return fallback.doStream(params);
          throw e;
        }
      },
    },
  });
}

export function getModel(env: Record<string, string | undefined> = process.env) {
  if (!env.GEMINI_API_KEY) throw new Error('Falta GEMINI_API_KEY en .env.local');
  const google = createGoogle({ apiKey: env.GEMINI_API_KEY });
  const primary = google(env.GEMINI_MODEL || 'gemini-flash-latest');
  return env.GEMINI_FALLBACK_MODEL ? withFallback(primary, google(env.GEMINI_FALLBACK_MODEL)) : primary;
}
```

- [ ] **Step 4: Implementar `lib/tools/mcp.ts`**

```ts
import { createMCPClient } from '@ai-sdk/mcp';
import type { ToolSet } from 'ai';
import { z } from 'zod';

export const DEFAULT_MCP_URL = 'https://www.optacost.com/docs/mcp';
export const SKILL_URI = 'mintlify://skills/optacost';

/** Allowlist: solo estas tools del MCP llegan al modelo (submit_feedback queda afuera). */
export const DOCS_TOOL_SCHEMAS = {
  search_optacost: {
    inputSchema: z.object({ query: z.string().describe('Texto a buscar en la documentación de Optacost') }),
  },
  query_docs_filesystem_optacost: {
    inputSchema: z.object({
      command: z.string().describe('Comando de solo lectura sobre los .mdx: rg, cat, head, tree, ls'),
    }),
  },
};

export type DocsConnection = { tools: ToolSet; skill?: string; available: boolean; close: () => Promise<void> };

let skillCache: string | undefined;

export function resetSkillCache() {
  skillCache = undefined;
}

export async function connectDocs(url: string, create: typeof createMCPClient = createMCPClient): Promise<DocsConnection> {
  try {
    const client = await create({ transport: { type: 'http', url } });
    const tools = (await client.tools({ schemas: DOCS_TOOL_SCHEMAS })) as ToolSet;
    if (skillCache === undefined) {
      try {
        const r = await client.readResource({ uri: SKILL_URI });
        skillCache = r.contents.map((c) => ('text' in c && typeof c.text === 'string' ? c.text : '')).join('\n');
      } catch {
        skillCache = '';
      }
    }
    return { tools, skill: skillCache || undefined, available: true, close: () => client.close() };
  } catch (e) {
    console.warn('[mcp] documentación no disponible:', e instanceof Error ? e.message : e);
    return { tools: {}, available: false, close: async () => {} };
  }
}
```

- [ ] **Step 5: Implementar `lib/agent/prompt.ts`**

```ts
import { STEPS } from '@/lib/onboarding/steps';

export const DOCS_BASE_URL = 'https://www.optacost.com/docs';

function stepsList(): string {
  return STEPS.map((s, i) => {
    const optional = s.optionalColumns.length ? ` Opcionales/recomendadas: ${s.optionalColumns.join(', ')}.` : '';
    const dynamic = s.dynamicHint ? ` ${s.dynamicHint}` : '';
    return `${i + 1}. ${s.id} — ${s.title} (${s.category} · ${s.categoryTitle}). Plantilla: ${s.templateFile}. Obligatorias: ${s.requiredColumns.join(', ')}.${optional}${dynamic}`;
  }).join('\n');
}

export function buildInstructions(opts: { skill?: string; docsAvailable: boolean; lab: string }): string {
  const parts = [
    `Sos el asistente de onboarding de Optacost para el laboratorio "${opts.lab}". Hablás en español rioplatense, claro, amable y breve. Tus usuarios son personal de laboratorio, no técnicos.`,
    '',
    '## Tu trabajo',
    '1. Guiar al laboratorio por los 14 pasos de carga de datos, en orden (se puede saltear y volver).',
    '2. Validar cada archivo que adjunten con la tool validar_archivo y explicar qué corregir, con fila y columna.',
    '3. Responder dudas sobre Optacost usando SOLO la documentación (tools search_optacost y query_docs_filesystem_optacost).',
    '',
    '## Reglas',
    `- Sobre el producto, respondé solo con lo que devuelva la documentación y citá la página como link: ${DOCS_BASE_URL}/<ruta> (sin ".mdx"). Si no hay información, decilo; no inventes.`,
    '- Nunca inventes resultados de validación: siempre llamá validar_archivo.',
    '- Cuando el usuario adjunta un archivo, el mensaje trae una línea "[Archivo adjunto: <nombre> — fileId: <id>]". Usá ese fileId.',
    '- No tenés acceso al contenido de los archivos, solo al reporte: no pidas que peguen los datos en el chat.',
    '- Si validar_archivo responde "ambiguo" o "desconocido", preguntá qué datos son y volvé a llamar con "tipo".',
    '- Si la validación da ok=true (0 errores), llamá marcar_paso con ese paso y contá cuál sigue. Si hay advertencias, mencionalas, pero no bloquean.',
    '- Si hay errores, resumilos agrupados por tipo (máximo 5 ejemplos) y pedí que corrijan y vuelvan a adjuntar.',
    '- Al pedir un archivo, indicá las columnas obligatorias, la plantilla y la convención de nombre AAAA-MM-DD_NombreDelDato.xlsx.',
    '- Para saber en qué paso está el laboratorio, usá ver_progreso.',
    '',
    '## Pasos del onboarding',
    stepsList(),
  ];
  if (!opts.docsAvailable) {
    parts.push(
      '',
      '## Aviso',
      'La documentación de Optacost no está disponible en este momento. No respondas preguntas sobre el producto: decí que la documentación no está disponible y ofrecé seguir con la validación de archivos.',
    );
  }
  if (opts.skill) parts.push('', '## Guía de Optacost (provista por la documentación)', opts.skill);
  return parts.join('\n');
}
```

- [ ] **Step 6: Implementar `lib/agent/run.ts`**

```ts
import {
  APICallError,
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  RetryError,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type ToolSet,
  type UIMessage,
} from 'ai';
import { isRateLimit } from './model';

export type AgentDeps = {
  model: LanguageModel;
  tools: ToolSet;
  instructions: string;
  docsAvailable: boolean;
  onEnd?: () => Promise<void> | void;
  maxRetries?: number;
};

export function friendlyError(error: unknown): string {
  const e = RetryError.isInstance(error) ? error.lastError : error;
  if (isRateLimit(e)) return 'Se alcanzó el límite gratuito de Gemini. Esperá un minuto y reenviá el mensaje.';
  if (APICallError.isInstance(e) && (e.statusCode ?? 0) >= 500) {
    return 'Gemini no está respondiendo en este momento. Probá de nuevo en unos segundos.';
  }
  console.error('[agent]', e);
  return 'Ocurrió un error inesperado al generar la respuesta. Probá de nuevo.';
}

export async function streamAgentResponse(messages: UIMessage[], deps: AgentDeps): Promise<Response> {
  const result = streamText({
    model: deps.model,
    instructions: deps.instructions,
    messages: await convertToModelMessages(messages, { tools: deps.tools, ignoreIncompleteToolCalls: true }),
    tools: deps.tools,
    stopWhen: isStepCount(6),
    maxRetries: deps.maxRetries ?? 3,
    onEnd: async () => {
      await deps.onEnd?.();
    },
  });
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onError: friendlyError,
      messageMetadata: ({ part }) => (part.type === 'start' ? { docsAvailable: deps.docsAvailable } : undefined),
    }),
  });
}
```

Nota: si ante un error `onEnd` no se ejecuta, el cliente MCP queda abierto. Igual se cierra por timeout del servidor MCP, que es stateless, así que es aceptable en la v1.

- [ ] **Step 7: Correr y verificar que pasa**

Run: `npx vitest run test/agent && npm run typecheck`
Esperado: PASS y `tsc` sin errores. Si `tsc` marca un nombre de campo distinto en AI SDK 7 (por ejemplo `part.text` vs `part.delta` en `text-delta`, o la firma de `messageMetadata`), corregir **según los tipos instalados** en `node_modules/ai/dist/index.d.ts` sin cambiar el comportamiento.

- [ ] **Step 8: Commit**

```bash
git add lib/agent lib/tools/mcp.ts test/agent
git commit -m "feat(agent): Gemini con fallback, MCP de docs con allowlist, prompt y stream

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Rutas de API

**Files:**
- Create: `app/api/upload/route.ts`, `app/api/progress/route.ts`, `app/api/chat/route.ts`, `lib/client/upload.ts`
- Test: `test/api/routes.test.ts`, `test/client/upload.test.ts`

**Interfaces:**
- Consume: `readFile`, `ReadError` (Task 3); `fileStore` (Task 8); `getProgressStore`, `LAB_ID`, `DEFAULT_LAB`, `progressView` (Task 8); `createValidateTool`, `createProgressTools` (Task 9); `connectDocs`, `DEFAULT_MCP_URL`, `getModel`, `buildInstructions`, `streamAgentResponse` (Task 10).
- Produce: `POST /api/upload` (multipart, campo `file`) → `200 { fileId, nombre, hojas: string[], filas: number }` o `400 { error }`. `GET /api/progress?lab=` → `200 progressView(...)` o `400 { error }`. `POST /api/chat` con cuerpo `{ messages: UIMessage[], lab?: string }` → stream de UI messages.
- Produce (`lib/client/upload.ts`): `type UploadResult`, `attachmentText(a: UploadResult): string`, `ATTACHMENT_RE: RegExp` (grupo 1 = nombre, grupo 2 = fileId), `uploadFile(file: File): Promise<UploadResult>`.

- [ ] **Step 1: Escribir los tests que fallan**

`test/client/upload.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ATTACHMENT_RE, attachmentText } from '@/lib/client/upload';

describe('marcador de adjunto', () => {
  it('ida y vuelta nombre/fileId', () => {
    const text = `Validá esto\n\n${attachmentText({ fileId: 'f_ab12cd34ef56', nombre: '2026-07-15_Usuarios.xlsx', hojas: [], filas: 3 })}`;
    const m = ATTACHMENT_RE.exec(text);
    expect(m?.[1]).toBe('2026-07-15_Usuarios.xlsx');
    expect(m?.[2]).toBe('f_ab12cd34ef56');
  });
});
```

`test/api/routes.test.ts`:

```ts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { csvBytes, xlsxBytes } from '../helpers';

beforeAll(async () => {
  process.env.ONBOARDING_DIR = await mkdtemp(join(tmpdir(), 'api-'));
});

async function upload(bytes: Uint8Array, name: string) {
  const { POST } = await import('@/app/api/upload/route');
  const form = new FormData();
  form.append('file', new File([bytes], name));
  return POST(new Request('http://test/api/upload', { method: 'POST', body: form }));
}

describe('POST /api/upload', () => {
  it('parsea y devuelve fileId', async () => {
    const res = await upload(xlsxBytes({ Usuarios: [['Nombre completo', 'Email', 'Rol'], ['Ana', 'a@x.com', 'Editor']] }), 'u.xlsx');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ nombre: 'u.xlsx', hojas: ['Usuarios'], filas: 1 });
    expect(data.fileId).toMatch(/^f_/);
    const { fileStore } = await import('@/lib/files/store');
    expect(fileStore.get(data.fileId)?.fileName).toBe('u.xlsx');
  });

  it('400 con motivo en español', async () => {
    const res = await upload(csvBytes('x'), 'a.pdf');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Formato no soportado');
  });

  it('400 sin archivo', async () => {
    const { POST } = await import('@/app/api/upload/route');
    const res = await POST(new Request('http://test/api/upload', { method: 'POST', body: new FormData() }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/progress', () => {
  it('devuelve los 14 pasos', async () => {
    const { GET } = await import('@/app/api/progress/route');
    const res = await GET(new Request('http://test/api/progress?lab=prueba'));
    expect(res.status).toBe(200);
    expect((await res.json()).pasos).toHaveLength(14);
  });
  it('400 con lab inválido', async () => {
    const { GET } = await import('@/app/api/progress/route');
    expect((await GET(new Request('http://test/api/progress?lab=../x'))).status).toBe(400);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/api test/client`
Esperado: FAIL, módulos inexistentes.

- [ ] **Step 3: Implementar `lib/client/upload.ts`**

```ts
export type UploadResult = { fileId: string; nombre: string; hojas: string[]; filas: number };

export const ATTACHMENT_RE = /\[Archivo adjunto: (.+?) — fileId: (f_[a-z0-9]+)\]/;

export function attachmentText(a: UploadResult): string {
  return `[Archivo adjunto: ${a.nombre} — fileId: ${a.fileId}]`;
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const data = (await res.json().catch(() => ({}))) as Partial<UploadResult> & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'No se pudo subir el archivo.');
  return data as UploadResult;
}
```

- [ ] **Step 4: Implementar `app/api/upload/route.ts`**

```ts
import { fileStore } from '@/lib/files/store';
import { readFile, ReadError } from '@/lib/validation/read';

export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024;

const badRequest = (error: string) => Response.json({ error }, { status: 400 });

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest('No recibí ningún archivo.');
  }
  const file = form.get('file');
  if (!(file instanceof File)) return badRequest('No recibí ningún archivo.');
  if (file.size > MAX_BYTES) return badRequest('El archivo supera el máximo de 10 MB.');
  try {
    const parsed = readFile(new Uint8Array(await file.arrayBuffer()), file.name);
    const fileId = fileStore.put(parsed);
    return Response.json({
      fileId,
      nombre: file.name,
      hojas: parsed.sheets.map((s) => s.name),
      filas: parsed.sheets.reduce((n, s) => n + Math.max(0, s.lines.length - 1), 0),
    });
  } catch (e) {
    if (e instanceof ReadError) return badRequest(e.message);
    throw e;
  }
}
```

- [ ] **Step 5: Implementar `app/api/progress/route.ts`**

```ts
import { DEFAULT_LAB, LAB_ID } from '@/lib/onboarding/lab';
import { getProgressStore } from '@/lib/onboarding/state';
import { progressView } from '@/lib/onboarding/steps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const lab = new URL(req.url).searchParams.get('lab') ?? DEFAULT_LAB;
  if (!LAB_ID.test(lab)) return Response.json({ error: 'Laboratorio inválido.' }, { status: 400 });
  return Response.json(progressView(await getProgressStore().load(lab)));
}
```

- [ ] **Step 6: Implementar `app/api/chat/route.ts`**

```ts
import type { UIMessage } from 'ai';
import { getModel } from '@/lib/agent/model';
import { buildInstructions } from '@/lib/agent/prompt';
import { streamAgentResponse } from '@/lib/agent/run';
import { fileStore } from '@/lib/files/store';
import { DEFAULT_LAB, LAB_ID } from '@/lib/onboarding/lab';
import { getProgressStore } from '@/lib/onboarding/state';
import { connectDocs, DEFAULT_MCP_URL } from '@/lib/tools/mcp';
import { createProgressTools } from '@/lib/tools/progress';
import { createValidateTool } from '@/lib/tools/validate';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json()) as { messages?: UIMessage[]; lab?: string };
  const lab = body.lab ?? DEFAULT_LAB;
  if (!LAB_ID.test(lab) || !Array.isArray(body.messages)) {
    return Response.json({ error: 'Solicitud inválida.' }, { status: 400 });
  }

  let model;
  try {
    model = getModel();
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Modelo no configurado.' }, { status: 500 });
  }

  const docs = await connectDocs(process.env.OPTACOST_MCP_URL || DEFAULT_MCP_URL);
  const progress = getProgressStore();
  const tools = {
    ...docs.tools,
    validar_archivo: createValidateTool({ files: fileStore, progress, lab }),
    ...createProgressTools({ progress, lab }),
  };

  return streamAgentResponse(body.messages, {
    model,
    tools,
    instructions: buildInstructions({ skill: docs.skill, docsAvailable: docs.available, lab }),
    docsAvailable: docs.available,
    onEnd: docs.close,
  });
}
```

- [ ] **Step 7: Correr y verificar que pasa**

Run: `npx vitest run test/api test/client && npm run typecheck`
Esperado: PASS y `tsc` sin errores.

- [ ] **Step 8: Commit**

```bash
git add app/api lib/client test/api test/client
git commit -m "feat(api): rutas de upload, progreso y chat

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Interfaz de chat

**Files:**
- Create: `components/chat/chat.tsx`, `components/chat/message-view.tsx`, `components/validation-report.tsx`, `components/progress-panel.tsx`
- Modify: `app/page.tsx` (reemplazo completo)

**Interfaces:**
- Consume: `uploadFile`, `attachmentText`, `ATTACHMENT_RE`, `UploadResult` (Task 11); `ValidateOutput` (tipo, Task 9); `Issue` (tipo, Task 2); `StepView` (tipo, Task 8); `LAB_ID`, `DEFAULT_LAB` (Task 8). APIs `/api/chat`, `/api/upload`, `/api/progress` (Task 11).
- Produce: página `/` con `?lab=<id>`.

Esta UI no tiene tests unitarios: se verifica con build y de forma manual en el Task 13.

- [ ] **Step 1: `components/validation-report.tsx`**

```tsx
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
```

- [ ] **Step 2: `components/chat/message-view.tsx`**

```tsx
'use client';

import type { UIMessage } from 'ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ValidationReportCard } from '@/components/validation-report';
import { ATTACHMENT_RE } from '@/lib/client/upload';
import type { ValidateOutput } from '@/lib/tools/validate';

type ToolPart = { type: string; toolName?: string; state: string; output?: unknown; errorText?: string };

const TOOL_LABELS: Record<string, [running: string, done: string]> = {
  search_optacost: ['🔎 Buscando en la documentación…', '📄 Documentación consultada'],
  query_docs_filesystem_optacost: ['📖 Leyendo la documentación…', '📄 Documentación consultada'],
  ver_progreso: ['Revisando el progreso…', '📋 Progreso consultado'],
  marcar_paso: ['Actualizando el progreso…', '✅ Progreso actualizado'],
  validar_archivo: ['🧪 Validando archivo…', ''],
};

function toolNameOf(part: ToolPart): string {
  return part.type === 'dynamic-tool' ? (part.toolName ?? '') : part.type.slice('tool-'.length);
}

function ToolView({ part }: { part: ToolPart }) {
  const name = toolNameOf(part);
  if (part.state === 'output-error') return <p className="text-xs text-red-700">⚠️ Falló {name}: {part.errorText}</p>;
  if (name === 'validar_archivo' && part.state === 'output-available') {
    return <ValidationReportCard output={part.output as ValidateOutput} />;
  }
  if (name === 'marcar_paso' && part.state === 'output-available' && (part.output as { ok?: boolean })?.ok === false) {
    return null;
  }
  const [running, done] = TOOL_LABELS[name] ?? ['Procesando…', 'Listo'];
  const label = part.state === 'output-available' ? done : running;
  return label ? <p className="text-xs text-slate-500">{label}</p> : null;
}

function UserText({ text }: { text: string }) {
  const m = ATTACHMENT_RE.exec(text);
  const clean = text.replace(ATTACHMENT_RE, '').trim();
  return (
    <div className="space-y-2">
      {clean && <p className="whitespace-pre-wrap">{clean}</p>}
      {m && <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-xs">📎 {m[1]}</span>}
    </div>
  );
}

export function MessageView({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] space-y-2 rounded-2xl px-4 py-3 text-sm ${
          isUser ? 'bg-slate-900 text-white' : 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
        }`}
      >
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            return isUser ? (
              <UserText key={i} text={part.text} />
            ) : (
              <div key={i} className="markdown">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer" /> }}
                >
                  {part.text}
                </ReactMarkdown>
              </div>
            );
          }
          if (part.type === 'dynamic-tool' || part.type.startsWith('tool-')) {
            return <ToolView key={i} part={part as unknown as ToolPart} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `components/progress-panel.tsx`**

```tsx
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
```

- [ ] **Step 4: `components/chat/chat.tsx`**

```tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ProgressPanel } from '@/components/progress-panel';
import { attachmentText, uploadFile, type UploadResult } from '@/lib/client/upload';
import { MessageView } from './message-view';

const SUGGESTIONS = ['Quiero empezar el onboarding', '¿Qué datos tengo que preparar?', '¿Cómo voy con el onboarding?'];

export function Chat({ lab }: { lab: string }) {
  const [transport] = useState(() => new DefaultChatTransport({ api: '/api/chat', body: { lab } }));
  const { messages, sendMessage, status, error, regenerate } = useChat({ transport });
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [progressVersion, setProgressVersion] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const busy = status === 'submitted' || status === 'streaming';
  const docsUnavailable = messages.some(
    (m) => m.role === 'assistant' && (m.metadata as { docsAvailable?: boolean } | undefined)?.docsAvailable === false,
  );

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (status === 'ready' || status === 'error') setProgressVersion((v) => v + 1);
  }, [status]);

  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      setAttachment(await uploadFile(file));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'No se pudo subir el archivo.');
    } finally {
      setUploading(false);
    }
  }

  function send(text: string) {
    const t = text.trim();
    if (busy || uploading || (!t && !attachment)) return;
    const full = attachment ? `${t || 'Validá este archivo.'}\n\n${attachmentText(attachment)}` : t;
    void sendMessage({ text: full });
    setInput('');
    setAttachment(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <div className="flex h-screen">
      <main className="flex flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-6 py-3">
          <h1 className="text-base font-semibold">Onboarding Optacost</h1>
          <p className="text-xs text-slate-500">Laboratorio: {lab}</p>
        </header>

        {docsUnavailable && (
          <div className="border-b border-amber-300 bg-amber-50 px-6 py-2 text-xs text-amber-900">
            La documentación de Optacost no está disponible ahora. Podés seguir validando archivos.
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {messages.length === 0 && (
            <div className="mx-auto max-w-xl rounded-2xl bg-white p-6 text-sm shadow-sm ring-1 ring-slate-200">
              <p className="font-semibold">¡Hola! Soy el asistente de onboarding de Optacost.</p>
              <p className="mt-2 text-slate-600">
                Te guío para preparar los datos del laboratorio y reviso tus planillas (.xlsx o .csv) antes de enviarlas.
                Adjuntá un archivo con 📎 o preguntame lo que necesites.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <MessageView key={m.id} message={m} />
          ))}
          {status === 'submitted' && <p className="text-xs text-slate-500">Pensando…</p>}
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800">
              {error.message || 'Ocurrió un error.'}{' '}
              <button type="button" className="underline" onClick={() => void regenerate()}>
                Reintentar
              </button>
            </div>
          )}
          <div ref={bottom} />
        </div>

        <form onSubmit={onSubmit} className="border-t border-slate-200 bg-white px-6 py-3">
          {(attachment || uploading || uploadError) && (
            <div className="mb-2 flex items-center gap-2 text-xs">
              {uploading && <span className="text-slate-500">Subiendo archivo…</span>}
              {attachment && (
                <span className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1">
                  📎 {attachment.nombre} · {attachment.filas} filas
                  <button type="button" aria-label="Quitar adjunto" onClick={() => setAttachment(null)}>
                    ✕
                  </button>
                </span>
              )}
              {uploadError && <span className="text-red-700">{uploadError}</span>}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input ref={fileInput} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onPickFile} />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy || uploading}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
              aria-label="Adjuntar archivo"
            >
              📎
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={attachment ? 'Agregá un comentario (opcional) y enviá' : 'Escribí tu consulta…'}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
            <button
              type="submit"
              disabled={busy || uploading || (!input.trim() && !attachment)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
        </form>
      </main>

      <aside className="hidden w-80 overflow-y-auto border-l border-slate-200 bg-white md:block">
        <ProgressPanel lab={lab} version={progressVersion} />
      </aside>
    </div>
  );
}
```

- [ ] **Step 5: Reemplazar `app/page.tsx`**

```tsx
import { Chat } from '@/components/chat/chat';
import { DEFAULT_LAB, LAB_ID } from '@/lib/onboarding/lab';

export default async function Page({ searchParams }: { searchParams: Promise<{ lab?: string }> }) {
  const { lab = DEFAULT_LAB } = await searchParams;
  if (!LAB_ID.test(lab)) {
    return <main className="p-8 text-sm">Laboratorio inválido: usá solo minúsculas, números y guiones.</main>;
  }
  return <Chat lab={lab} />;
}
```

- [ ] **Step 6: Verificar con tests, typecheck y build**

```bash
npm test && npm run typecheck && npx next build
```

Esperado: todos los tests PASS, `tsc` sin errores y build OK. Si `useChat` o `DefaultChatTransport` tienen otra firma en `@ai-sdk/react@4`, ajustar según `node_modules/@ai-sdk/react/dist/index.d.ts` y `node_modules/ai/docs/04-ai-sdk-ui/02-chatbot.mdx`.

- [ ] **Step 7: Commit**

```bash
git add app components
git commit -m "feat(ui): chat con adjuntos, tarjeta de validación y panel de progreso

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Prueba real de punta a punta y README

**Files:**
- Create: `README.md`
- Uso local (no se commitea): `samples/`

**Interfaces:**
- Consume: toda la app.

- [ ] **Step 1: Preparar muestras**

Crear `samples/` (está en `.gitignore`) con:
- `samples/2026-07-15_Usuarios.csv` con errores: `Nombre completo;Email;Rol` / `Ana;ana@lab.com;Admin` / `Juan;;Editor` / `Ana B;ANA@lab.com;Editor`.
- `samples/2026-07-15_Usuarios_ok.csv` corregido: `Nombre completo;Email;Rol` / `Ana;ana@lab.com;Administrador` / `Juan;juan@lab.com;Editor`.
- Copias **locales** de las entregas reales de Labmedicina de la carpeta de Drive "Optacost — Onboarding Labmedicina / 02 · Operación del laboratorio / Entregas del laboratorio" (`Template_Practicas_Optacost.xlsx`, `Template_Insumos_Optacost.xlsx`, `Template_Relaciones_Consumo_Optacost.xlsx`, `Template_Sectores_Optacost.xlsx`). Pedirle a Luca que las descargue a `samples/` desde Drive. **Solo lectura: no modificar nada en Drive.**

- [ ] **Step 2: Levantar la app**

Run: `npm run dev` (en segundo plano) y abrir `http://localhost:3000/?lab=prueba`.

- [ ] **Step 3: Recorrido manual (con el browser o Playwright MCP)**

Verificar, en orden:
1. Clic en "¿Qué datos tengo que preparar?": la respuesta cita una página `https://www.optacost.com/docs/...` y en la UI aparece "📄 Documentación consultada".
2. Adjuntar `2026-07-15_Usuarios.csv` y enviar: aparece la tarjeta ❌ con 3 errores (celda vacía en fila 3, rol "Admin" con sugerencia "Administrador" en fila 2, duplicado en fila 4) y el panel muestra Usuarios como ❌.
3. Adjuntar `2026-07-15_Usuarios_ok.csv`: tarjeta ✅, el agente llama `marcar_paso` y el panel muestra Usuarios ✅ (1 de 14).
4. Adjuntar las entregas reales de Labmedicina: anotar errores y advertencias. Si hay falsos positivos (por ejemplo un alias de encabezado no contemplado), agregar el alias en `lib/validation/schemas.ts` **con un test** en `test/validation/schemas.test.ts` o `validate.test.ts`, y commitear.
5. Subir un `.pdf` renombrado a `.xlsx`: mensaje "no parece un Excel válido" sin llamar a Gemini.
6. Recargar la página: el progreso persiste (viene de `.onboarding/prueba.json`).

- [ ] **Step 4: Escribir `README.md`**

````markdown
# Agente de onboarding Optacost

Asistente web que guía a un laboratorio en la carga de datos de Optacost, valida sus planillas (.xlsx/.csv) y responde dudas con la documentación oficial (MCP `https://www.optacost.com/docs/mcp`). Usa solo el tier gratuito de Gemini.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completar GEMINI_API_KEY y GEMINI_MODEL
npm run dev                  # http://localhost:3000/?lab=labmedicina
```

| Variable | Descripción |
|---|---|
| `GEMINI_API_KEY` | API key de Google AI Studio (free tier) |
| `GEMINI_MODEL` | Modelo, por ejemplo `gemini-flash-lite-latest` |
| `GEMINI_FALLBACK_MODEL` | Opcional: modelo a usar si el principal responde 429 |
| `OPTACOST_MCP_URL` | MCP de documentación |

## Cómo funciona

- Los archivos se parsean en el server (`/api/upload`) y quedan en memoria 1 hora. **Su contenido nunca se manda a Gemini**: el modelo solo recibe el reporte de validación.
- La validación es código determinístico (`lib/validation`), con 14 esquemas basados en las plantillas de "Optacost — Onboarding Labmedicina" y en `/onboarding/checklist-datos`.
- El progreso se guarda en `.onboarding/<lab>.json`. Un paso solo se completa con una validación sin errores.

## Tests

```bash
npm test
npm run typecheck
```
````

- [ ] **Step 5: Verificación final y commit**

```bash
npm test && npm run typecheck && npx next build
git add README.md lib test
git commit -m "docs: README y ajustes de la prueba real

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Esperado: todo PASS. Reportar en el chat los resultados del recorrido del Step 3: qué funcionó y qué se ajustó.
