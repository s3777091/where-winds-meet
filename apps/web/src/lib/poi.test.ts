import { describe, expect, it } from "vitest";
import { floorLabel, formatPercentage, getNextPOI, progressSummary, sourceCategoryLabel } from "./poi";
import type { POI, RegionProgress } from "./types";

describe("poi helpers", () => {
  it("formats completion with one decimal place", () => {
    expect(formatPercentage(91.444)).toBe("91.4%");
  });

  it("describes progress without inventing totals", () => {
    const progress: RegionProgress = {
      region_id: "DEV_QINGHE",
      total: 7,
      completed: 3,
      remaining: 4,
      percentage: 42.857,
      categories: [],
    };
    expect(progressSummary(progress)).toBe("3/7 đã hoàn thành");
  });

  it("selects the first deterministic route stop", () => {
    const poi = { id: "DEV_QH_CHEST_001" } as POI;
    expect(getNextPOI({ stops: [{ poi }] })).toEqual(poi);
  });

  it("translates UI taxonomy without changing official POI names", () => {
    expect(sourceCategoryLabel("Boundary Stone", true)).toBe("Mốc ranh giới (Boundary Stone)");
    expect(floorLabel("Surface")).toBe("Mặt đất");
  });
});
