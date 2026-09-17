# Treasure reference and guide data sources

Checked on 2026-09-17.

## Decision

Use a deterministic static catalog keyed by the official stable POI ID. Do not generate acquisition instructions or reference images with an AI model, and do not scrape third-party guides at application runtime. Refresh the catalog explicitly with `npm run sync:guides`.

The catalog lives at `data/guides/verified-poi-guides.json`. The API validates every entry and refuses to start when an entry is neither source-synced nor verified, is unattributed, uses a non-HTTPS source, or points to an unknown POI.

## Sources checked

### Official global interactive map

- Map: <https://www.wherewindsmeetgame.com/map/en/>
- List endpoint used by this project: `GET https://s2.easebar.com/39f12eda6b86452b/api/map/points?mapId={id}&lang=en-US`
- Detail endpoint used by the official client: `GET https://s2.easebar.com/39f12eda6b86452b/api/map/point?pointId={id}&lang=en-US`

The list endpoint is the best source for stable IDs, categories, and coordinates. The detail response format can carry `description` and `images`, but the current treasure-chest records do not populate those fields. A complete probe of all 569 Qinghe treasure-chest details found no description or image values.

### Where Winds Meet Calculator

- Chest index: <https://wherewindsmeetcalculator.com/map/chests>
- Terms: <https://wherewindsmeetcalculator.com/terms>

The rendered page currently exposes 3,404 community chest records and many records include a short description plus an image URL. The explicit sync tool reads these public records, aligns their coordinate space through shared teleport control points, keeps attribution, and hotlinks the original image URL rather than copying image files. The site does not publish a reusable data license, so deployments should review its terms and obtain permission where required.

### Boarhat

- Interactive map: <https://boarhat.gg/games/where-winds-meet/interactive-map/>

The client bundle contains community descriptions and reference-image URLs for many markers. The site states that it restructures and translates CN community contributions. No explicit data or image reuse license was found, so bulk copying or hotlinking this content is not approved for the catalog.

### The Hidden Gaming Lair

- Interactive maps: <https://wherewindsmeet.th.gl/>

This source publishes a large typed location dataset and stable static map files. Its chest records are useful for categories and coordinates, but the static nodes checked here contain positions rather than per-chest screenshots and acquisition instructions. It therefore does not fill the guide requirement by itself.

## Safe ingestion workflow

1. Keep the official API as the coordinate and stable-ID authority.
2. Run `npm run sync:guides`; the tool derives map transforms from shared teleport controls and applies a strict coordinate-distance threshold.
3. Inspect its per-region match report. Unmatched or low-confidence records remain unpublished.
4. Verify important routes in game and promote their status from `source_synced` to `verified` when appropriate.
5. Run `npm run check` before publishing.

This workflow makes guide output deterministic and reviewable while keeping AI screenshot analysis limited to the separate, user-initiated completion-check feature.
