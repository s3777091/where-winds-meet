import type {
  AnalysisResult,
  CompletionStatus,
  Health,
  POI,
  POICategory,
  ProgressExport,
  Region,
  RegionProgress,
  RouteResult,
  Settings,
  SourceCategorySummary,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Yêu cầu thất bại với mã ${response.status}`);
  }

  return (await response.json()) as T;
}

export const api = {
  health: () => request<Health>("/health"),
  regions: () => request<Region[]>("/regions"),
  progress: (regionId: string) => request<RegionProgress>(`/regions/${regionId}/progress`),
  sourceCategories: (regionId: string) =>
    request<SourceCategorySummary[]>(`/regions/${regionId}/source-categories`),
  pois: (filters: {
    regionId?: string;
    categories?: POICategory[];
    missingOnly?: boolean;
    search?: string;
    floor?: string;
    sourceCategories?: string[];
  }) => {
    const query = new URLSearchParams();
    if (filters.regionId) query.set("region_id", filters.regionId);
    if (filters.categories?.length) query.set("categories", filters.categories.join(","));
    if (filters.missingOnly) query.set("missing_only", "true");
    if (filters.search) query.set("search", filters.search);
    if (filters.floor && filters.floor !== "all") query.set("floor", filters.floor);
    if (filters.sourceCategories?.length) query.set("source_categories", filters.sourceCategories.join(","));
    return request<POI[]>(`/pois?${query.toString()}`);
  },
  poi: (id: string) => request<POI>(`/pois/${id}`),
  setCompletion: (id: string, status: Extract<CompletionStatus, "completed" | "not_completed">) =>
    request<POI>(`/pois/${id}/${status === "completed" ? "complete" : "uncomplete"}`, {
      method: "POST",
    }),
  analyzeScreenshot: (input: { poiId: string; image: File; note?: string }) => {
    const body = new FormData();
    body.set("poi_id", input.poiId);
    body.set("image", input.image);
    if (input.note) body.set("optional_note", input.note);
    return request<AnalysisResult>("/screenshots/analyze", { method: "POST", body });
  },
  route: (input: {
    regionId: string;
    start?: [number, number];
    categories?: POICategory[];
    floor?: string;
    search?: string;
    sourceCategories?: string[];
  }) =>
    request<RouteResult>("/routes", {
      method: "POST",
      body: JSON.stringify({
        region_id: input.regionId,
        start: input.start,
        categories: input.categories,
        source_categories: input.sourceCategories,
        ...(input.floor && input.floor !== "all" ? { floor: input.floor } : {}),
        ...(input.search?.trim() ? { search: input.search.trim() } : {}),
      }),
    }),
  settings: () => request<Settings>("/settings"),
  updateSettings: (settings: Settings) =>
    request<Settings>("/settings", { method: "PUT", body: JSON.stringify(settings) }),
  exportProgress: () => request<ProgressExport>("/progress/export"),
  importProgress: (payload: ProgressExport) =>
    request<{ imported: number }>("/progress/import", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
