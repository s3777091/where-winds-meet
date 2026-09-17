import type { POI, POICategory, Region, RegionProgress } from "./types";

export const CATEGORY_LABELS: Record<POICategory, string> = {
  chest: "Rương báu",
  oddity: "Kỳ vật",
  puzzle: "Giải đố",
  quest: "Nhiệm vụ",
};

const REGION_LABELS: Record<string, string> = {
  OFFICIAL_1: "Thanh Hà (Qinghe)",
  OFFICIAL_2: "Khai Phong (Kaifeng)",
  OFFICIAL_3: "Hà Tây (Hexi)",
  OFFICIAL_4: "Hoàng cung Khai Phong",
  OFFICIAL_5: "Bất Kiến Sơn",
};

const SOURCE_CATEGORY_LABELS: Record<string, string> = {
  Antiques: "Đồ cổ",
  "Boundary Stone": "Mốc ranh giới",
  Camp: "Doanh trại",
  "Cat Play": "Trò chơi với mèo",
  Encounter: "Kỳ ngộ",
  "Hidden Path": "Lối đi bí ẩn",
  "Injustice Quest": "Nhiệm vụ oan khuất",
  "Martial Fellowship": "Kết giao võ lâm",
  "Meow Meow": "Miêu Miêu",
  Oddity: "Kỳ vật",
  "Treasure Chest": "Rương báu",
  "Universal Harmony": "Vạn vật hòa âm",
  "Wild Ritual Ghost Fire": "Lửa ma nghi lễ hoang dã",
};

export const CATEGORY_COLORS: Record<POICategory, string> = {
  chest: "#d7a958",
  oddity: "#a9c58d",
  puzzle: "#74a6a1",
  quest: "#c98774",
};

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function getNextPOI(route: { stops: { poi: POI }[] } | undefined): POI | undefined {
  return route?.stops[0]?.poi;
}

export function progressSummary(progress: RegionProgress | undefined): string {
  if (!progress) return "Đang tải tiến độ";
  return `${progress.completed}/${progress.total} đã hoàn thành`;
}

export function regionLabel(region: Region | undefined): string {
  if (!region) return "Đang tải khu vực";
  return REGION_LABELS[region.id] ?? region.name;
}

export function sourceCategoryLabel(sourceCategory: string | undefined, includeOriginal = false): string {
  if (!sourceCategory) return "Chưa phân loại";
  const translated = SOURCE_CATEGORY_LABELS[sourceCategory] ?? sourceCategory;
  return includeOriginal && translated !== sourceCategory ? `${translated} (${sourceCategory})` : translated;
}

export function floorLabel(floor: string): string {
  if (floor === "Surface") return "Mặt đất";
  if (floor === "all") return "Tất cả tầng";
  return floor;
}

export function entranceLabel(entrance: string): string {
  if (entrance === "No entrance note is provided by the official map.") {
    return "Bản đồ chính thức không cung cấp ghi chú lối vào.";
  }
  return entrance;
}
