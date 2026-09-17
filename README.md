# Where Winds Meet Smart Companion

A local-first completion map for Where Winds Meet with official public map data, local progress, deterministic routing, and user-initiated screenshot analysis.

## What works

- Five official regions and 5,528 live POIs loaded from the public Where Winds Meet interactive-map API
- Official raster map tiles served through a constrained local proxy so the browser is not blocked by cross-origin rules
- Search, category filters, missing-only view, progress, POI details, and JSON import/export
- Viewport-limited interactive markers and a paged sidebar for responsive rendering with thousands of locations
- Deterministic cost-aware routing with directed 2-opt improvement and no AI-token usage
- Screenshot paste/drop/file selection, image reduction, result validation, confidence thresholds, and perceptual-hash caching
- OpenRouter vision analysis with a free-first model and a low-cost fallback; credentials stay in the Go service
- Zero-setup local JSON persistence, plus optional PostgreSQL/PostGIS support

The default `official` data mode never silently falls back to development fixtures. If the upstream source is unavailable, the API uses the last official local cache or fails startup when no official cache exists. Fixture mode is available only when explicitly selected.

## Start locally

Requirements: Node.js 20.9+, PowerShell on Windows, and Docker only for optional PostgreSQL/PostGIS.

```powershell
npm install
powershell -ExecutionPolicy Bypass -File scripts\setup-go.ps1
npm run dev
```

Open [http://localhost:3199](http://localhost:3199). The web app proxies `/api/*` to the local Go service on port 3200.

The setup script installs a checksum-verified Go toolchain under the ignored `.tools` directory; no system-wide Go installation is required.

## Official map data

The Go service reads POIs from the public API used by the [official Where Winds Meet interactive map](https://www.wherewindsmeetgame.com/map/) and stores a refreshable cache at `data/local/official-map-cache.json`. Raster tiles remain hosted by the official site and are fetched on demand through an allowlisted local endpoint. Third-party tiles are not copied into the repository.

Reference images and acquisition instructions are loaded from the deterministic catalog at `data/guides/verified-poi-guides.json`. Run `npm run sync:guides` to fetch the public community index, align it to official POIs through shared teleport control points, and atomically refresh high-confidence matches. The sync keeps source attribution, does not download image files, and preserves manually curated entries. Chinese source descriptions are translated to Vietnamese through the configured translation model and cached in `data/guides/translation-cache.vi.json`; the model translates existing facts only and does not generate new guide instructions.

```dotenv
WWM_DATA_SOURCE=official
WWM_OFFICIAL_CACHE_FILE=data/local/official-map-cache.json
WWM_GUIDE_FILE=data/guides/verified-poi-guides.json
```

For development-only fixtures, explicitly set `WWM_DATA_SOURCE=fixture`.

## OpenRouter screenshot analysis

The browser never receives the API key. Put server-side values in the gitignored `.env.local` file:

```dotenv
AI_ANALYSIS_ENABLED=true
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your-server-side-key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=google/gemma-4-26b-a4b-it:free
OPENROUTER_FALLBACK_MODELS=qwen/qwen3.7-flash
```

The free Gemma model is attempted first. If its shared free pool is rate-limited, the service falls back to Qwen 3.7 Flash. Analysis results are cached by POI, perceptual image hash, provider/model list, game patch, and knowledge-base version, so identical repeat checks do not call OpenRouter again.

Before any progress change, the backend validates image type and size, reduces the image, constrains the task to the selected POI, parses tolerant-but-typed JSON, validates the status, requires non-empty evidence, and requires at least 0.85 confidence for automatic completion. Ambiguous results never mark a location complete.

## Quality checks

```powershell
npm run check
```

This runs ESLint, TypeScript checks, web tests, Go tests, and both production builds.

## Storage

The default mode stores player state and analysis cache in the ignored `data/local/player-state.json` file. Set `DATABASE_URL` to use PostgreSQL/PostGIS. The current Docker database bootstrap contains development seed rows for database integration testing, so use the default file store for the live official dataset unless you import verified official records into PostgreSQL.

## Project layout

```text
apps/web                 Next.js, React, MapLibre, Zustand, TanStack Query
services/api             Go API, official-data adapter, tile proxy, AI orchestration
packages/contracts       Machine-readable HTTP contract
packages/map             Map data conventions
data/migrations          PostgreSQL and PostGIS schema
data/seed                Explicit development fixtures only
data/local               Ignored official cache, player state, and analysis cache
docs                     Architecture and data policy
scripts                  Windows setup, build, test, and run helpers
```

See [docs/architecture.md](docs/architecture.md) and [docs/data-policy.md](docs/data-policy.md).
