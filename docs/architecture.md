# Architecture

## Runtime

```text
Browser at localhost:3199
  -> Next.js application and same-origin /api rewrite
  -> Go API at 127.0.0.1:3200
     -> official public POI API + ignored local official cache
     -> allowlisted official raster-tile proxy
     -> local player state or PostgreSQL/PostGIS
     -> OpenRouter only for user-requested screenshot analysis
```

## Hosted assistant

The hosted deployment keeps each project boundary explicit:

```text
map.protexa.cloud
  -> Caddy
  -> Next.js web
     -> isolated Go map API
     -> isolated knowledge API
        -> isolated wwm-neo4j container
        -> OpenRouter only after retrieval
  -> existing Supabase Kong only for /auth/v1 session validation
```

The Where Winds Meet stack has its own Docker network, volumes, container names, and Neo4j instance. It does not reuse the existing `neo4j-db` container. The only shared service is Supabase Auth through its public Kong API; the application never connects directly to the shared Postgres database.

Knowledge ingestion reads public, robots-allowed pages from `windsmeet.wiki` and `windsmeetguide.com`, plus the public WWM Compendium JSON endpoint. It records source URLs, aliases, topics, regions, version flags, and cross-page references in Neo4j. Chat retrieval uses Neo4j full-text search plus graph neighbors. The model receives only retrieved excerpts, must cite `[S1]` style source identifiers, and falls back to a source list when citations are missing or invalid.

Next.js owns the UI. Go owns POIs, progress, routes, settings, import/export, official-data refresh, the constrained tile proxy, AI calls, and the analysis cache. The browser cannot read the OpenRouter key.

## Map

MapLibre owns camera state and raster rendering. Region metadata points to same-origin tile URLs. The Go proxy accepts only the five known official map names, the English tile set, zooms 1 to 13, and numeric tile coordinates, preventing it from becoming a general-purpose proxy.

POI markers are created only for the current viewport and capped at 300. This keeps interaction responsive while the full filtered POI set remains available for search, progress, and route calculations. The sidebar renders 100 results at a time.

The application keeps official attribution visible and links POI provenance to the official map.

## Screenshot-analysis safety

```text
Image and selected POI
  -> media/size validation
  -> perceptual hash and cache lookup
  -> image reduction
  -> free-first OpenRouter model, then low-cost fallback
  -> tolerant JSON parsing and strict domain validation
  -> confidence >= 0.85 and non-empty evidence
  -> progress store
```

Invalid status, low-confidence completion, missing evidence, or provider failure never marks a POI complete. Repeated identical analysis is returned from the local cache.

## Route cost

The route engine creates a deterministic cost-aware nearest-neighbor seed, then improves it with directed 2-opt passes. Haversine distance plus explicit floor, entrance, and requirement penalties are included in the optimization. AI is not used for route ordering.

## Storage

`FileStore` is the default and persists player progress, settings, and analysis cache in ignored local files. `PostgresStore` uses the same domain interface with PostGIS geometry and indexes when `DATABASE_URL` is set.

## Provenance

Every POI includes source, source type, verification status, patch version, source URL, and verification date. Official POIs use stable `OFFICIAL_<map>_<point>` IDs. Development fixtures remain explicitly opt-in and keep the `DEV_` prefix.
