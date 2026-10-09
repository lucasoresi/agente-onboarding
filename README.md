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
