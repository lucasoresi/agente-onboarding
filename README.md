# Agente de onboarding Optacost

Asistente web que guía a un laboratorio en la carga de datos de Optacost, valida sus planillas (.xlsx/.csv) y responde dudas con la documentación oficial (MCP `https://www.optacost.com/docs/mcp`). Usa solo el tier gratuito de Gemini.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completar GEMINI_API_KEY y GEMINI_MODEL
npm run dev -- -p 3100       # http://localhost:3100/?lab=<id-del-laboratorio> (por defecto: demo)
```

| Variable | Descripción |
|---|---|
| `GEMINI_API_KEY` | API key de Google AI Studio (free tier) |
| `GEMINI_MODEL` | Modelo, por ejemplo `gemini-flash-lite-latest` |
| `GEMINI_FALLBACK_MODEL` | Opcional: modelo a usar si el principal responde 429 |
| `OPTACOST_MCP_URL` | MCP de documentación |

## Cómo funciona

- El servidor no guarda nada (funciona igual en Vercel). El navegador lee el archivo adjunto, lo comprime y lo manda con cada mensaje (solo el último adjunto; máximo 10 MB, o unos 3 MB comprimido por el límite de 4,5 MB de Vercel). El servidor lo valida en ese mismo request y lo descarta. **Su contenido nunca se manda a Gemini**: el modelo solo recibe el reporte de validación.
- La validación es código determinístico (`lib/validation`), con 14 esquemas que un test compara contra las plantillas oficiales de Optacost (`test/fixtures/templates/`). Si cambian las plantillas, reemplazá esos archivos y corré `npm test`.
- El progreso se guarda en el navegador (`localStorage`, por laboratorio) y viaja con cada mensaje; el servidor lo devuelve actualizado en la metadata de la respuesta. Si la persona cambia de navegador o borra los datos del sitio, el progreso arranca de cero. Un paso solo se completa con una validación sin errores.

## Tests

```bash
npm test
npm run typecheck
```
