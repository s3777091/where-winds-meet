"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { POICategory } from "@/lib/types";

interface CompanionState {
  selectedRegionId: string;
  selectedPOIId?: string;
  missingOnly: boolean;
  categories: POICategory[];
  floor: string;
  search: string;
  sourceCategory: string;
  detailOpen: boolean;
  setRegion: (id: string) => void;
  selectPOI: (id?: string) => void;
  setMissingOnly: (value: boolean) => void;
  toggleCategory: (category: POICategory) => void;
  showAllCategories: () => void;
  setFloor: (floor: string) => void;
  setSearch: (value: string) => void;
  setSourceCategory: (value: string) => void;
  setDetailOpen: (value: boolean) => void;
}

const ALL_CATEGORIES: POICategory[] = ["chest", "oddity", "puzzle", "quest"];

export const useCompanionStore = create<CompanionState>()(
  persist(
    (set) => ({
      selectedRegionId: "OFFICIAL_1",
      missingOnly: true,
      categories: ALL_CATEGORIES,
      floor: "all",
      search: "",
      sourceCategory: "all",
      detailOpen: false,
      setRegion: (selectedRegionId) => set({ selectedRegionId, selectedPOIId: undefined, sourceCategory: "all" }),
      selectPOI: (selectedPOIId) => set({ selectedPOIId, detailOpen: Boolean(selectedPOIId) }),
      setMissingOnly: (missingOnly) => set({ missingOnly }),
      toggleCategory: (category) =>
        set((state) => ({
          categories: state.categories.length === ALL_CATEGORIES.length
            ? [category]
            : state.categories.includes(category)
              ? state.categories.filter((item) => item !== category)
              : [...state.categories, category],
        })),
      showAllCategories: () => set({ categories: ALL_CATEGORIES }),
      setFloor: (floor) => set({ floor }),
      setSearch: (search) => set({ search }),
      setSourceCategory: (sourceCategory) => set({ sourceCategory }),
      setDetailOpen: (detailOpen) => set({ detailOpen }),
    }),
    {
      name: "wwm-companion-ui",
      partialize: (state) => ({
        selectedRegionId: state.selectedRegionId,
        missingOnly: state.missingOnly,
        categories: state.categories,
        floor: state.floor,
        sourceCategory: state.sourceCategory,
      }),
    },
  ),
);
