# Map package boundary

Map data remains independent from the React component tree. Supported inputs include raster tiles, PMTiles, vector tiles, and GeoJSON overlays.

The current implementation loads official public region and POI metadata in the Go service, exposes stable `OFFICIAL_` IDs, and renders official raster tiles through an allowlisted same-origin proxy. Interactive POI markers are limited to the current viewport for performance.

Any replacement source must preserve stable IDs, coordinate reference information, floor metadata, entrance points, provenance, attribution, and license information. Never commit copied third-party map tiles without explicit permission.
