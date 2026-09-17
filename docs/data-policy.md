# Game data policy

The repository does not bundle copied raster maps or an exported proprietary POI dataset.

In the default mode, the app reads current POIs from the public endpoints used by the official Where Winds Meet interactive map. It stores only an ignored local runtime cache and fetches raster tiles on demand from their official host through a constrained localhost proxy. Attribution and the official source URL remain visible.

Public availability does not by itself grant redistribution rights. Do not commit the generated official cache or copied tiles. Before publishing or redistributing any third-party dataset or asset bundle, confirm its license and terms.

All records must preserve source, source URL, source type, verification status, patch version, last verification date, and stable IDs. Unverified content must be visibly labelled.

Reference images and acquisition instructions are deterministic source data rather than AI-generated gameplay facts. Publish them only through `data/guides/verified-poi-guides.json`. Chinese source descriptions may receive a constrained machine translation that is stored in `translation-cache.vi.json`; translation must preserve the source facts and pass the no-Han-character check. Automated records retain HTTPS attribution and use `source_synced`; manually checked records use `verified`.

The repository still contains explicitly labelled development fixtures for tests and offline development. They are used only when `WWM_DATA_SOURCE=fixture` is set and must never be presented as verified game locations.
