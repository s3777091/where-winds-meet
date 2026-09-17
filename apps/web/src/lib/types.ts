export type CompletionStatus = "completed" | "not_completed" | "uncertain";

export type POICategory = "chest" | "oddity" | "puzzle" | "quest";

export interface Region {
  id: string;
  name: string;
  fixture: boolean;
  center: [number, number];
  bounds: [[number, number], [number, number]];
  tile_url?: string;
  min_zoom?: number;
  max_zoom?: number;
  initial_zoom?: number;
  attribution?: string;
}

export interface SourceCategorySummary {
  name: string;
  total: number;
}

export interface Provenance {
  source: string;
  source_url?: string;
  source_type: "dev_fixture" | "manual" | "licensed" | "official" | "community_sync";
  verification_status: "fixture" | "unverified" | "verified" | "source_synced";
  patch_version: string;
  last_verified_date?: string;
}

export interface ReferenceImage {
  url: string;
  alt: string;
  caption?: string;
  source_url: string;
}

export interface POI {
  id: string;
  name: string;
  category: POICategory;
  region_id: string;
  subregion: string;
  coordinates: [number, number];
  floor: string;
  entrance: string;
  entrance_coordinates?: [number, number];
  nearest_landmark: string;
  requirements: string[];
  navigation_steps: string[];
  solution_steps: string[];
  common_mistake: string;
  reference_images: ReferenceImage[];
  guide_provenance?: Provenance;
  status: CompletionStatus;
  source_category?: string;
  provenance: Provenance;
}

export interface CategoryProgress {
  category: POICategory;
  total: number;
  completed: number;
  remaining: number;
}

export interface RegionProgress {
  region_id: string;
  total: number;
  completed: number;
  remaining: number;
  percentage: number;
  categories: CategoryProgress[];
}

export interface AnalysisResult {
  analysis_id: string;
  poi_id: string;
  status: CompletionStatus;
  confidence: number;
  evidence: string[];
  cached: boolean;
  provider: string;
}

export interface RouteStop {
  order: number;
  poi: POI;
  leg_cost: number;
}

export interface RouteResult {
  stops: RouteStop[];
  total_cost: number;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
}

export interface Settings {
  language: string;
  ai_model: string;
  game_patch: string;
  kb_version: string;
}

export interface Health {
  status: string;
  storage: string;
  ai_mode: "mock" | "openrouter" | "qwen";
  version: string;
}

export interface ProgressExport {
  schema_version: number;
  exported_at: string;
  progress: Record<string, CompletionStatus>;
  settings: Settings;
}
