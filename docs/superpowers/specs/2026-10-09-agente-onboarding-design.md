# Agente de Onboarding Optacost — Diseño

- **Fecha:** 2026-10-09
- **Autor:** Luca Soresi (con Claude)
- **Estado:** Aprobado en conversación, pendiente de revisión escrita

## 1. Objetivo

Un asistente web que guía a un **laboratorio cliente nuevo** de Optacost a lo largo del onboarding de datos y **valida los archivos CSV/xlsx** que el laboratorio prepara, antes de entregarlos al equipo de Optacost.

El agente:

1. Responde preguntas sobre Optacost usando **solo** la documentación pública, a través del MCP `https://www.optacost.com/docs/mcp`, y cita las páginas.
2. Lleva al laboratorio paso a paso por los 14 grupos de datos (categorías 01 → 04).
3. Valida cada archivo adjunto contra la estructura oficial y explica qué corregir.
4. Registra el progreso: un paso se completa solo con una validación sin errores.

**Criterio de éxito:** un usuario de Labmedicina puede abrir la página, adjuntar sus planillas reales, recibir errores precisos por fila y columna, corregirlas y terminar con el checklist completo, sin consultar a nadie del equipo, usando únicamente el tier gratuito de Gemini.

### Fuera de alcance (v1)

- Cargar datos en la base de Optacost. Más adelante se hará con otro MCP con acceso a la DB; el diseño deja ese punto de extensión en `lib/tools/mcp.ts`.
- Login, multi-usuario, historial de chat persistente, deploy público.
- Leer archivos desde Google Drive. El usuario los adjunta desde su PC.
- Integración en el dashboard (`dashboard-copia/optacost`). Queda como paso posterior y se facilita por usar el mismo stack.

## 2. Restricciones

- **LLM:** solo Gemini en el tier gratuito, vía `@ai-sdk/google` con `GEMINI_API_KEY`. No se configura ningún proveedor pago (misma regla que `lib/informes/narrative.ts` del dashboard).
- **Free tier:** límites bajos de requests por minuto y por día. Hay que minimizar las llamadas: el contenido de los archivos nunca se envía al modelo, los comandos de validación directos no usan el LLM y las vueltas de tools están acotadas.
- **Privacidad:** los datos del laboratorio (facturación, precios) no salen del server local. Al modelo solo le llega el reporte de validación.
- **MCP de docs:** público y sin autenticación. Transporte streamable HTTP sin estado (verificado: `initialize` y `tools/call` responden sin `Mcp-Session-Id`).
- **Carpeta de Drive "Optacost — Onboarding Labmedicina":** solo lectura. Nunca se modifica.

## 3. Stack

Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + componentes de chat de AI SDK (AI Elements). AI SDK (`ai`, `@ai-sdk/react`, `@ai-sdk/google`, cliente MCP de AI SDK), `xlsx` (SheetJS), `papaparse`, Vitest. Es el mismo stack base que el dashboard para poder migrarlo después.

Las versiones exactas se fijan en el plan, verificando la última estable de cada paquete.

## 4. Arquitectura

```
agente-onboarding/
├── app/
│   ├── page.tsx                   # Chat (useChat) + panel lateral de progreso
│   └── api/
│       ├── chat/route.ts          # streamText: Gemini + tools (MCP + locales), stopWhen(6)
│       ├── upload/route.ts        # CSV/xlsx → parseo en memoria → fileId
│       └── progress/route.ts      # GET progreso del lab
├── components/
│   ├── chat/                      # Mensajes, input con adjuntos
│   ├── validation-report.tsx      # Tarjeta: estado, errores por fila, advertencias
│   └── progress-panel.tsx         # Checklist 01→04 con estados
├── lib/
│   ├── agent/
│   │   ├── model.ts               # google(GEMINI_MODEL) + fallback opcional
│   │   └── prompt.ts              # System prompt + resource mintlify://skills/optacost
│   ├── tools/
│   │   ├── mcp.ts                 # Clientes MCP desde config (hoy: docs Optacost)
│   │   ├── validate.ts            # tool validar_archivo
│   │   └── progress.ts            # tools ver_progreso / marcar_paso
│   ├── files/store.ts             # Store en memoria de archivos parseados (TTL 1 h)
│   ├── onboarding/
│   │   ├── steps.ts               # 14 pasos ordenados
│   │   └── state.ts               # Persistencia en .onboarding/<lab>.json
│   └── validation/
│       ├── schemas.ts             # 14 esquemas
│       ├── normalize.ts           # Normalización de encabezados y valores
│       ├── read.ts                # csv/xlsx → { headers, rows }
│       └── validate.ts            # Reglas puras → ValidationReport
└── test/
```

### Responsabilidades y límites

| Unidad | Hace | Depende de |
|---|---|---|
| `lib/validation/*` | Lógica pura: archivo parseado + esquema → reporte. Sin I/O de red ni LLM. | `xlsx`, `papaparse` |
| `lib/files/store.ts` | Guarda `{fileId → ParsedFile}` en memoria con TTL de 1 h. | — |
| `lib/onboarding/*` | Define los pasos y lee/escribe el progreso por laboratorio. Registra las validaciones OK por paso. | fs |
| `lib/tools/validate.ts` | Adapta validation + store como tool del modelo. Infiere el tipo. Trunca el reporte que recibe el modelo. | validation, store, onboarding |
| `lib/tools/progress.ts` | `ver_progreso` y `marcar_paso`. Este último **rechaza** marcar un paso sin una validación OK. | onboarding |
| `lib/tools/mcp.ts` | Crea los clientes MCP a partir de una lista de configuración y expone sus tools con un filtro (allowlist). | AI SDK MCP |
| `lib/agent/*` | Modelo y prompt. No conoce detalles de validación. | `@ai-sdk/google` |
| `app/api/chat` | Orquesta: modelo + tools + `stopWhen` + manejo de errores. | todo lo anterior |

## 5. Flujo

### Arranque de una conversación

1. La página se abre con `?lab=<id>` (por defecto `labmedicina`). El panel pide `GET /api/progress?lab=<id>`.
2. En la primera llamada a `/api/chat`, el server crea el cliente MCP, lista sus tools y lee el resource `mintlify://skills/optacost`, que se cachea en memoria y se suma al system prompt.
3. El agente saluda y propone el primer paso pendiente.

### Turno con archivo adjunto

1. El usuario adjunta un archivo. El browser hace `POST /api/upload` (multipart) y recibe `{fileId, nombre, hojas, filas}`.
2. `useChat` envía el texto más la metadata `{fileId, nombre}`. **El contenido no viaja.**
3. Gemini llama `validar_archivo({fileId, tipo?})`.
4. La tool devuelve el reporte. La UI lo muestra como tarjeta (tool part) y el modelo recibe una versión truncada: totales más los primeros 20 errores.
5. Gemini explica qué corregir. Si hay 0 errores, llama `marcar_paso(paso)`. El server verifica que exista una validación OK de ese paso y actualiza el progreso, y el panel se refresca.

### Turno de pregunta

Gemini usa `search_optacost` o `query_docs_filesystem_optacost` y cita las páginas como `https://www.optacost.com/docs/<ruta>`.

### Tools que ve el modelo

| Tool | Origen | Notas |
|---|---|---|
| `search_optacost` | MCP | Búsqueda semántica |
| `query_docs_filesystem_optacost` | MCP | `rg` / `cat` / `tree` sobre las páginas `.mdx` |
| `validar_archivo(fileId, tipo?)` | Local | |
| `ver_progreso()` | Local | |
| `marcar_paso(paso)` | Local | Verificado por código |

`submit_feedback` (MCP) **no** se expone en la v1.

### Detección del tipo de archivo

En orden: `tipo` explícito → nombre del archivo (`AAAA-MM-DD_<Nombre>.xlsx`, sin tildes ni mayúsculas) → coincidencia de encabezados (mayor proporción de columnas obligatorias encontradas, con un mínimo del 60%). Si quedan dos candidatos a menos de 10 puntos, la tool responde `ambiguo` con la lista y el agente le pregunta al usuario.

## 6. Esquemas (14 pasos)

Las columnas salen de las plantillas de Drive, y la obligatoriedad y los enums de `/onboarding/checklist-datos`. **O** = obligatorio, **R** = recomendado, **Op** = opcional.

| # | Paso (`id`) | Cat. | Columnas |
|---|---|---|---|
| 1 | `usuarios` | 01 | Nombre completo (O, texto), Email (O, email, único), Rol (O, enum `Administrador`/`Editor`/`Solo lectura`) |
| 2 | `sedes` | 01 | Nombre de la sede (O, único), Código (R, único si está presente) |
| 3 | `sectores` | 01 | Nombre del sector (O, único) |
| 4 | `practicas` | 02 | Código de práctica (O, único), Nombre de práctica (O), **dinámicas** `[Nombre del arancel N]` (≥1, la primera O; número ≥ 0) |
| 5 | `insumos` | 02 | Código de insumo (O, único), Nombre de insumo (O), Precio de última compra (O, número ≥ 0), Fecha de última compra (O, fecha), Proveedor (Op), Activo (Op, enum sí/no), Cantidad (Op, número ≥ 0) |
| 6 | `relaciones_consumo` | 02 | Código de insumo (O), Código de práctica (O), Rendimiento (O, número > 0); par único |
| 7 | `practicas_compuestas` | 02 | Código práctica madre (O), Código práctica hija (O); par único, madre ≠ hija |
| 8 | `facturacion` | 03 | Código de práctica (O), Nombre de práctica (O), Código de convenio (O), Nombre de convenio (O), Sede (O), Cantidad facturada (O, número ≥ 0), Bruto facturado (O, número), Bruto en ventanilla (Op, número), Identificador de derivación (Op) |
| 9 | `costos_indirectos` | 03 | Nombre (O), Monto (O, número ≥ 0) |
| 10 | `convenios` | 04 | Código (O, único), Nombre (O), Tipo de arancel (O, enum `Derivación`/`Especial`), Ajuste (Op, número), Región (Op) |
| 11 | `obras_sociales` | 04 | Código (O, único), Nombre (O), Valor UB (O, número ≥ 0) |
| 12 | `modulos_obra_social` | 04 | Código de práctica (O, único), Descripción de práctica (O), **dinámicas** `[Código de obra social N]` (≥1, la primera O según la plantilla; número ≥ 0) |
| 13 | `precios_competencia` | 04 | Código de examen (O, único), Descripción (O), Precio (O, número ≥ 0) |
| 14 | `matching_codigos` | 04 | Código de examen de la competencia (O), Código de examen propio (O); par único |

Las columnas dinámicas son las que no coinciden con ninguna columna fija. Si alguna conserva los corchetes o el texto literal del placeholder, es error.

`precios_competencia` y `matching_codigos` pueden repetirse, uno por competidor. En la v1 el paso se completa con al menos una validación OK de cada uno.

## 7. Reglas de validación

| Regla | Severidad |
|---|---|
| Archivo vacío o sin encabezados | Error |
| Falta columna obligatoria | Error |
| Falta columna recomendada | Advertencia |
| Columna desconocida (en esquemas sin dinámicas) | Advertencia |
| Celda obligatoria vacía | Error |
| Tipo inválido (número, fecha, email) | Error |
| Número fuera de rango (negativo; rendimiento ≤ 0) | Error |
| Valor fuera del enum | Error, con sugerencia por similitud |
| Duplicado en clave única o par único | Error (indica las filas involucradas) |
| Placeholder dinámico sin reemplazar | Error |
| Esquema dinámico sin ninguna columna dinámica | Error |
| Fila de ejemplo de la plantilla presente (`ejemplo, borrar`) | Error |
| Nombre de archivo fuera de convención `AAAA-MM-DD_Nombre` | Advertencia |
| Código que no está en un catálogo ya validado en la sesión (prácticas/insumos) | Advertencia |
| Catálogo de referencia no validado aún | Advertencia informativa ("no se pudo verificar") |

### Normalización

- **Encabezados:** minúsculas, sin tildes, espacios colapsados y sin puntuación final. Alias aceptados por columna (por ejemplo `cod. practica`, `codigo practica` → Código de práctica).
- **Números:** se aceptan `1.234,56`, `1234,56`, `1234.56` y `$ 1.234`. Si un valor como `1.234` es ambiguo, se toma con punto de miles cuando la columna tiene otros valores con coma decimal.
- **Fechas:** `dd/mm/aaaa`, `dd-mm-aaaa`, ISO `aaaa-mm-dd` y serial de Excel.
- **Enums:** comparación normalizada. `si`/`sí`/`1`/`true` → sí, y `no`/`0`/`false` → no.
- **CSV:** separador detectado entre `;`, `,` y tab. Encoding UTF-8 con BOM o sin BOM; si aparecen caracteres inválidos, se reintenta como Latin-1.
- **xlsx:** se usa la hoja cuyo nombre normalizado coincide con el esquema (por ejemplo "Prácticas") y, si no hay, la primera. Se ignoran las hojas de "Instrucciones".
- Las filas completamente vacías se ignoran. Los números de fila se reportan como en Excel (encabezado = fila 1).

### Forma del reporte

```ts
type ValidationReport = {
  fileName: string;
  schemaId: StepId;
  ok: boolean;                        // sin errores
  rows: number;
  errors: Issue[];
  warnings: Issue[];
  dynamicColumns?: string[];          // aranceles / OS detectados
};
type Issue = { rule: string; message: string; row?: number; column?: string; value?: string; suggestion?: string };
```

El modelo recibe `{ok, rows, totalErrors, totalWarnings, errors: primeros 20, warnings: primeras 10}`. La UI recibe el reporte completo.

## 8. Manejo de errores

| Situación | Comportamiento |
|---|---|
| Gemini 429 | Hasta 3 reintentos con backoff exponencial, respetando `retry-after`. Si hay `GEMINI_FALLBACK_MODEL`, se reintenta con ese modelo. Si nada funciona, el mensaje en el chat es "Se alcanzó el límite gratuito de Gemini, probá en ~1 min" y se puede reenviar. |
| Gemini 5xx o timeout | Igual que el 429. |
| MCP no disponible | El chat sigue con las tools locales, la UI muestra el aviso "Documentación no disponible" y el prompt indica no responder sobre el producto sin fuente. |
| Error de una tool MCP | Se devuelve como resultado de la tool para que el modelo reformule o avise. |
| Upload inválido (más de 10 MB, extensión no permitida, corrupto, más de 50.000 filas) | `400` con motivo en español, mostrado en la UI sin pasar por el LLM. |
| `fileId` expirado o inexistente | La tool responde "archivo expirado, volvé a adjuntarlo". |
| `marcar_paso` sin validación OK | La tool responde un error explicativo y no cambia el progreso. |

Las API keys nunca se loguean ni se mandan al cliente.

## 9. Configuración

`.env.local` (en `.gitignore`), con `.env.example` versionado:

```
GEMINI_API_KEY=
GEMINI_MODEL=gemini-flash-latest
GEMINI_FALLBACK_MODEL=
OPTACOST_MCP_URL=https://www.optacost.com/docs/mcp
```

El progreso se guarda en `.onboarding/<lab>.json` (en `.gitignore`) con forma `{ lab, steps: { [stepId]: { status, lastFile, validatedAt, errors } } }`.

## 10. System prompt (lineamientos)

- Rol: asistente de onboarding de Optacost, en español rioplatense, claro y amable, para personal de laboratorio no técnico.
- Responder sobre el producto **solo** con información del MCP, citar la página y, si no hay fuente, decirlo.
- Guiar en el orden de los pasos, pero permitir saltear y volver.
- No inventar resultados de validación: siempre llamar `validar_archivo`.
- Al pedir un archivo, indicar columnas obligatorias, la plantilla y la convención de nombre.
- No pedir ni mostrar el contenido de los archivos. Trabajar con el reporte.
- Se agrega el contenido del resource `mintlify://skills/optacost`.

## 11. Testing

- **TDD con Vitest.**
- **`lib/validation`:** un test por regla de la sección 7 y por normalización, con fixtures sintéticos (CSV `;` y `,`, Latin-1, BOM, serial de fecha Excel, dinámicas con y sin reemplazo, fila de ejemplo, duplicados, enums con sugerencia).
- **`lib/tools`:** `validar_archivo` contra el store (OK, errores, expirado, ambiguo, truncado), y `marcar_paso` que rechaza sin validación OK y acepta con ella.
- **`app/api/chat`:** con el modelo mock de AI SDK y un MCP falso, verifica que el flujo tool call → resultado → respuesta funcione y que `submit_feedback` no esté expuesto.
- **Prueba manual final:** `npm run dev` con Gemini y el MCP reales. Validar copias locales de las entregas reales de Labmedicina (descargadas de Drive en solo lectura, guardadas en `samples/`, que está en `.gitignore`) y recorrer el checklist completo.

## 12. Evolución prevista (no v1)

- **Carga a la base:** agregar a la configuración de `lib/tools/mcp.ts` el MCP con acceso a la DB y una tool `cargar_archivo` que solo se habilita con el paso en ✅ y con confirmación explícita del usuario.
- **Integrar como `app/[subdomain]/onboarding` en el dashboard:** reutilizar su auth y tomar el lab desde el tenant.
- Reportar al equipo de docs, vía `submit_feedback` y con aprobación humana, las 6 plantillas que no están documentadas en `checklist-datos`.
