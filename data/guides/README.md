# Verified POI guides

This directory is the deterministic source for POI reference images and acquisition instructions. It is intentionally separate from screenshot analysis and must never be populated by an AI model.

Each entry in `verified-poi-guides.json` is keyed by the stable official POI ID. A publishable entry must include:

- source-provided navigation and/or solution steps, or manually reviewed steps;
- HTTPS reference-image URLs with useful alt text and a link to the page that published each image;
- source attribution, verification status `source_synced` or `verified`, patch/version, and synchronization date;
- a stable match to the official POI ID.

Run `npm run sync:guides` to refresh public community records. The tool requests only the two public index pages plus official map metadata, keeps remote images at their original URLs, stores an audit record for every match, and refuses a suspiciously small sync. Entries with `source_synced` are attributed community data and are not represented as in-game verification.

Source descriptions are translated into Vietnamese during sync and stored in `translation-cache.vi.json`. Translation is constrained to the source text and must not add gameplay advice. The sync fails without changing the catalog when any source description is missing or remains untranslated.
