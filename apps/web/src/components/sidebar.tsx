"use client";

import {
  ChartDonut,
  Check,
  CheckCircle,
  Circle,
  FunnelSimple,
  MagnifyingGlass,
  MapPin,
  MapTrifold,
  StackSimple,
  Stack,
  X,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { POIIcon } from "@/components/poi-icon";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  floorLabel,
  formatPercentage,
  regionLabel,
  sourceCategoryLabel,
} from "@/lib/poi";
import type { POI, POICategory, Region, RegionProgress, SourceCategorySummary } from "@/lib/types";

interface SidebarProps {
  section: "explore" | "progress";
  onClose: () => void;
  regions: Region[];
  selectedRegionId: string;
  onRegionChange: (id: string) => void;
  progress?: RegionProgress;
  progressLoading: boolean;
  pois: POI[];
  poisLoading: boolean;
  selectedPOIId?: string;
  onSelectPOI: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  missingOnly: boolean;
  onMissingOnlyChange: (value: boolean) => void;
  categories: POICategory[];
  onToggleCategory: (category: POICategory) => void;
  onShowAllCategories: () => void;
  floor: string;
  onFloorChange: (floor: string) => void;
  sourceCategories: SourceCategorySummary[];
  sourceCategory: string;
  onSourceCategoryChange: (value: string) => void;
}

const CATEGORY_ORDER: POICategory[] = ["chest", "oddity", "puzzle", "quest"];
const PAGE_SIZE = 100;

export function Sidebar(props: SidebarProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visiblePOIs = useMemo(() => props.pois.slice(0, visibleCount), [props.pois, visibleCount]);
  const currentRegion = props.regions.find((region) => region.id === props.selectedRegionId);
  const allCategoriesSelected = props.categories.length === CATEGORY_ORDER.length;
  const title = props.section === "progress" ? "Tiến độ khám phá" : "Khám phá bản đồ";

  return (
    <aside className="wwm-panel-enter relative z-30 flex h-full min-h-0 w-[390px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface-soft)] shadow-[18px_0_48px_rgb(2_7_12/0.22)] max-xl:w-[370px] max-lg:absolute max-lg:inset-y-0 max-lg:left-[82px] max-sm:left-0 max-sm:w-full">
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-[var(--line)] px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--surface-strong)] text-[var(--accent)]">
            {props.section === "progress" ? <ChartDonut size={19} weight="bold" /> : <MapTrifold size={19} weight="bold" />}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-bold tracking-[-0.025em]">{title}</h1>
            <p className="mt-0.5 truncate text-[10px] text-[var(--muted)]">{regionLabel(currentRegion)}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Đóng bảng"
          onClick={props.onClose}
          className="grid size-9 place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--text)]"
        >
          <X size={17} weight="bold" />
        </button>
      </header>

      <div className="shrink-0 border-b border-[var(--line)] px-4 py-3">
        <label className="relative block" htmlFor="poi-search">
          <MagnifyingGlass
            size={17}
            weight="bold"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />
          <span className="sr-only">Tìm địa điểm</span>
          <input
            id="poi-search"
            type="search"
            value={props.search}
            onChange={(event) => props.onSearchChange(event.target.value)}
            placeholder="Tìm rương, kỳ vật, nhiệm vụ..."
            className="h-11 w-full rounded-[var(--radius-sm)] border border-transparent bg-[var(--input)] pl-10 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--subtle)] focus:border-[var(--line-strong)]"
          />
        </label>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="relative" htmlFor="region-filter">
            <span className="sr-only">Khu vực</span>
            <MapTrifold size={15} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[var(--accent)]" />
            <select
              id="region-filter"
              value={props.selectedRegionId}
              onChange={(event) => props.onRegionChange(event.target.value)}
              className="h-10 w-full appearance-none rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--input)] pl-9 pr-7 text-xs font-semibold text-[var(--text)]"
              title="Chọn khu vực"
            >
              {props.regions.map((region) => (
                <option key={region.id} value={region.id}>{regionLabel(region)}</option>
              ))}
            </select>
          </label>
          <label className="relative" htmlFor="floor-filter">
            <span className="sr-only">Tầng</span>
            <Stack size={15} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[var(--accent)]" />
            <select
              id="floor-filter"
              value={props.floor}
              onChange={(event) => props.onFloorChange(event.target.value)}
              className="h-10 w-full appearance-none rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--input)] pl-9 pr-7 text-xs font-semibold text-[var(--text)]"
              title="Chọn tầng"
            >
              <option value="all">Tất cả tầng</option>
              <option value="Surface">Mặt đất</option>
              <option value="B1">Tầng B1</option>
              <option value="B2">Tầng B2</option>
            </select>
          </label>
        </div>
      </div>

      <section className="shrink-0 border-b border-[var(--line)] px-4 py-3" aria-labelledby="progress-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="progress-heading" className="text-xs font-semibold text-[var(--muted)]">Đã hoàn thành</h2>
            <p className="mt-1 font-mono text-lg font-semibold tracking-[-0.04em] text-[var(--text)]">
              {props.progressLoading ? "..." : `${props.progress?.completed ?? 0}/${props.progress?.total ?? 0}`}
            </p>
          </div>
          <p className="pb-0.5 font-mono text-xs font-semibold text-[var(--accent)]">
            {props.progress ? formatPercentage(props.progress.percentage) : "0%"}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-1.5" aria-label="Tiến độ theo tài nguyên">
          {CATEGORY_ORDER.map((category) => {
            const active = props.categories.includes(category);
            const data = props.progress?.categories.find((item) => item.category === category);
            const color = CATEGORY_COLORS[category];
            return (
              <button
                key={category}
                type="button"
                aria-pressed={active}
                aria-label={`${CATEGORY_LABELS[category]}: ${data?.completed ?? 0}/${data?.total ?? 0}`}
                title={CATEGORY_LABELS[category]}
                onClick={() => props.onToggleCategory(category)}
                className={`group flex min-w-0 flex-col items-center rounded-[var(--radius-sm)] border px-1 py-2 transition ${
                  active
                    ? "border-[var(--line-strong)] bg-[var(--surface-strong)] text-[var(--text)]"
                    : "border-transparent bg-[var(--input)] text-[var(--subtle)] opacity-55 hover:opacity-100"
                }`}
              >
                <span style={{ color }}><POIIcon category={category} size={18} /></span>
                <span className="mt-1 font-mono text-[9px] font-semibold">{data?.completed ?? 0}/{data?.total ?? 0}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={props.onShowAllCategories}
            className={`flex h-9 flex-1 items-center justify-center gap-2 rounded-[var(--radius-sm)] border text-[10px] font-semibold transition ${
              allCategoriesSelected
                ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent-strong)]"
                : "border-[var(--line)] bg-[var(--input)] text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            <StackSimple size={14} weight="bold" /> Hiện tất cả
          </button>
          <button
            type="button"
            aria-pressed={props.missingOnly}
            onClick={() => props.onMissingOnlyChange(!props.missingOnly)}
            className={`flex h-9 flex-1 items-center justify-center gap-2 rounded-[var(--radius-sm)] border text-[10px] font-semibold transition ${
              props.missingOnly
                ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent-strong)]"
                : "border-[var(--line)] bg-[var(--input)] text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            <Check size={14} weight="bold" /> Chỉ điểm chưa xong
          </button>
        </div>
      </section>

      <details className="group shrink-0 border-b border-[var(--line)] px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--text)]">
          <span className="flex items-center gap-2"><FunnelSimple size={15} /> Loại điểm chi tiết</span>
          <span className="max-w-40 truncate text-[10px] font-medium text-[var(--subtle)] group-open:hidden">
            {props.sourceCategory === "all" ? "Tất cả" : sourceCategoryLabel(props.sourceCategory)}
          </span>
          <X size={13} className="hidden rotate-45 group-open:block" />
        </summary>
        <label className="mt-3 block" htmlFor="source-category-filter">
          <span className="sr-only">Loại điểm</span>
          <select
            id="source-category-filter"
            value={props.sourceCategory}
            onChange={(event) => props.onSourceCategoryChange(event.target.value)}
            className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--input)] px-3 text-xs text-[var(--text)]"
          >
            <option value="all">Tất cả loại điểm</option>
            {props.sourceCategories.map((item) => (
              <option key={item.name} value={item.name}>
                {sourceCategoryLabel(item.name)} ({item.total})
              </option>
            ))}
          </select>
        </label>
      </details>

      <section className="flex min-h-0 flex-1 flex-col" aria-labelledby="results-heading">
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-3">
          <div className="min-w-0">
            <h2 id="results-heading" className="truncate text-xs font-semibold text-[var(--muted)]">Địa điểm trong khu vực</h2>
            <p className="mt-0.5 text-[10px] text-[var(--subtle)]">
              {props.categories.length === 0 ? "Chưa chọn loại tài nguyên" : `${props.pois.length} điểm đang hiển thị`}
            </p>
          </div>
          <span className="font-mono text-[10px] text-[var(--accent)]">{floorLabel(props.floor)}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {props.poisLoading ? (
            <div className="space-y-2 px-1">
              {[0, 1, 2, 3].map((item) => <div key={item} className="skeleton h-[66px] rounded-[var(--radius)]" />)}
            </div>
          ) : props.pois.length === 0 ? (
            <div className="mx-1 mt-1 rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] px-4 py-8 text-center">
              <CheckCircle size={28} weight="duotone" className="mx-auto text-[var(--success)]" />
              <p className="mt-3 text-sm font-semibold">Không có điểm phù hợp</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Chọn icon tài nguyên khác hoặc đổi tầng.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {visiblePOIs.map((poi) => {
                const selected = poi.id === props.selectedPOIId;
                const color = CATEGORY_COLORS[poi.category];
                return (
                  <button
                    key={poi.id}
                    type="button"
                    onClick={() => props.onSelectPOI(poi.id)}
                    className={`group grid w-full grid-cols-[36px_1fr_auto] items-center gap-3 rounded-[var(--radius)] border px-3 py-2.5 text-left transition ${
                      selected
                        ? "border-[color-mix(in_srgb,var(--accent)_54%,var(--line))] bg-[var(--surface-strong)]"
                        : "border-transparent bg-[var(--input)] hover:border-[var(--line)] hover:bg-[var(--surface)]"
                    }`}
                  >
                    <span className="grid size-9 place-items-center rounded-[var(--radius-sm)]" style={{ color, backgroundColor: `${color}1f` }}>
                      <POIIcon category={poi.category} sourceCategory={poi.source_category} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[var(--text)]">{poi.name}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-[var(--muted)]">
                        <MapPin size={10} weight="fill" />
                        <span className="truncate">{sourceCategoryLabel(poi.source_category)}</span>
                        <span>/</span>
                        <span>{floorLabel(poi.floor)}</span>
                      </span>
                    </span>
                    {poi.status === "completed"
                      ? <CheckCircle size={17} weight="fill" className="text-[var(--success)]" />
                      : <Circle size={14} weight="bold" className="text-[var(--subtle)]" />}
                  </button>
                );
              })}
              {visibleCount < props.pois.length && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                  className="mt-2 w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  Hiện thêm {Math.min(PAGE_SIZE, props.pois.length - visibleCount)} điểm
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}
