import { beforeEach, describe, expect, it } from "vitest";
import type { POICategory } from "@/lib/types";
import { useCompanionStore } from "./use-companion-store";

const ALL_CATEGORIES: POICategory[] = ["chest", "oddity", "puzzle", "quest"];

describe("resource category selection", () => {
  beforeEach(() => {
    localStorage.clear();
    useCompanionStore.setState({ categories: ALL_CATEGORIES });
  });

  it("focuses the first clicked category, then supports combining filters", () => {
    useCompanionStore.getState().toggleCategory("chest");
    expect(useCompanionStore.getState().categories).toEqual(["chest"]);

    useCompanionStore.getState().toggleCategory("oddity");
    expect(useCompanionStore.getState().categories).toEqual(["chest", "oddity"]);

    useCompanionStore.getState().toggleCategory("chest");
    expect(useCompanionStore.getState().categories).toEqual(["oddity"]);
  });

  it("restores every category from a focused selection", () => {
    useCompanionStore.getState().toggleCategory("quest");
    useCompanionStore.getState().showAllCategories();

    expect(useCompanionStore.getState().categories).toEqual(ALL_CATEGORIES);
  });
});
