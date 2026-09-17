"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowClockwise,
  ChartDonut,
  Compass,
  Crosshair,
  DownloadSimple,
  MapPinLine,
  MapTrifold,
  NavigationArrow,
  SidebarSimple,
  Sparkle,
  Stack,
  StackSimple,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import Image from "next/image";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { CATEGORY_COLORS, CATEGORY_LABELS, getNextPOI, progressSummary, regionLabel } from "@/lib/poi";
import type { CompletionStatus, POICategory, ProgressExport, RouteResult } from "@/lib/types";
import { useCompanionStore } from "@/store/use-companion-store";
import { CompanionMap } from "./companion-map";
import { POIIcon } from "./poi-icon";
import { POIDetail } from "./poi-detail";
import { Sidebar } from "./sidebar";

const CATEGORY_ORDER: POICategory[] = ["chest", "oddity", "puzzle", "quest"];
const REGION_IMAGES: Record<string, string> = {
  OFFICIAL_1: "/regions/qinghe.png",
  OFFICIAL_2: "/regions/kaifeng.png",
  OFFICIAL_3: "/regions/hexi.png",
  OFFICIAL_4: "/regions/kaifeng-palace.png",
  OFFICIAL_5: "/regions/unseen-mountain.png",
};

export function CompanionApp() {
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [route, setRoute] = useState<RouteResult>();
  const [routeStart, setRouteStart] = useState<[number, number]>();
  const [pickingStart, setPickingStart] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [railSection, setRailSection] = useState<"explore" | "progress">("explore");
  const [transferMessage, setTransferMessage] = useState<string>();
  const {
    selectedRegionId,
    selectedPOIId,
    missingOnly,
    categories,
    floor,
    search,
    sourceCategory,
    setRegion,
    selectPOI,
    setMissingOnly,
    toggleCategory,
    showAllCategories,
    setFloor,
    setSearch,
    setSourceCategory,
  } = useCompanionStore();
  const deferredSearch = useDeferredValue(search);

  const healthQuery = useQuery({ queryKey: ["health"], queryFn: api.health, retry: 1 });
  const regionsQuery = useQuery({ queryKey: ["regions"], queryFn: api.regions });
  const activeRegionId = regionsQuery.data?.some((region) => region.id === selectedRegionId)
    ? selectedRegionId
    : regionsQuery.data?.[0]?.id;
  const progressQuery = useQuery({
    queryKey: ["progress", activeRegionId],
    queryFn: () => api.progress(activeRegionId!),
    enabled: Boolean(activeRegionId),
  });
  const sourceCategoriesQuery = useQuery({
    queryKey: ["source-categories", activeRegionId],
    queryFn: () => api.sourceCategories(activeRegionId!),
    enabled: Boolean(activeRegionId),
  });
  const poisQuery = useQuery({
    queryKey: ["pois", activeRegionId, categories, sourceCategory, missingOnly, deferredSearch, floor],
    queryFn: () =>
      categories.length === 0
        ? Promise.resolve([])
        : api.pois({
            regionId: activeRegionId,
            categories,
            missingOnly,
            search: deferredSearch,
            floor,
            sourceCategories: sourceCategory === "all" ? undefined : [sourceCategory],
          }),
    enabled: Boolean(activeRegionId),
  });
  const selectedPOIQuery = useQuery({
    queryKey: ["poi", selectedPOIId],
    queryFn: () => api.poi(selectedPOIId!),
    enabled: Boolean(selectedPOIId),
  });

  const currentRegion = regionsQuery.data?.find((region) => region.id === activeRegionId);
  const activeRouteStart = routeStart ?? currentRegion?.center;

  useEffect(() => {
    const regions = regionsQuery.data;
    if (regions?.length && !regions.some((region) => region.id === selectedRegionId)) {
      setRegion(regions[0].id);
    }
  }, [regionsQuery.data, selectedRegionId, setRegion]);

  function invalidateProgressData() {
    void queryClient.invalidateQueries({ queryKey: ["pois"] });
    void queryClient.invalidateQueries({ queryKey: ["poi"] });
    void queryClient.invalidateQueries({ queryKey: ["progress"] });
  }

  const routeMutation = useMutation({
    mutationFn: () =>
      api.route({
        regionId: activeRegionId!,
        start: activeRouteStart,
        categories,
        floor,
        search: deferredSearch,
        sourceCategories: sourceCategory === "all" ? undefined : [sourceCategory],
      }),
    onSuccess: (result) => {
      setRoute(result);
      setPickingStart(false);
    },
  });

  function refreshAfterProgressChange() {
    invalidateProgressData();
    if (route) routeMutation.mutate();
  }

  const completionMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Extract<CompletionStatus, "completed" | "not_completed"> }) =>
      api.setCompletion(id, status),
    onSuccess: refreshAfterProgressChange,
  });

  const nextPOI = getNextPOI(route);
  const apiUnavailable = healthQuery.isError;
  const selectedCategoryLabel = categories.length === CATEGORY_ORDER.length
    ? "tất cả tài nguyên"
    : categories.map((category) => CATEGORY_LABELS[category].toLocaleLowerCase("vi")).join(" và ");

  function openExplorer(section: "explore" | "progress" = "explore") {
    selectPOI(undefined);
    setRailSection(section);
    setPanelOpen(true);
  }

  function changeRegion(id: string) {
    setRegion(id);
    setRoute(undefined);
    setRouteStart(undefined);
    setPickingStart(false);
  }

  function toggleResource(category: POICategory) {
    toggleCategory(category);
    selectPOI(undefined);
    setRailSection("explore");
    setPanelOpen(true);
    setRoute(undefined);
  }

  function guideToSelectedResources() {
    if (categories.length === 0) {
      setTransferMessage("Hãy chọn ít nhất một loại tài nguyên");
      setPanelOpen(true);
      return;
    }
    setTransferMessage(undefined);
    routeMutation.mutate();
    setPanelOpen(false);
  }

  function pickRouteStart(coordinates: [number, number]) {
    setRouteStart(coordinates);
    setRoute(undefined);
    setPickingStart(false);
  }

  async function exportProgress() {
    try {
      const payload = await api.exportProgress();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `wwm-progress-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setTransferMessage("Đã xuất tiến độ");
    } catch (error) {
      setTransferMessage(error instanceof Error ? error.message : "Xuất tiến độ thất bại");
    }
  }

  async function importProgress(file?: File) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as ProgressExport;
      const result = await api.importProgress(payload);
      invalidateProgressData();
      if (route) routeMutation.mutate();
      setTransferMessage(`Đã nhập ${result.imported} bản ghi tiến độ`);
    } catch (error) {
      setTransferMessage(error instanceof Error ? error.message : "Nhập tiến độ thất bại");
    }
  }

  return (
    <main className="relative flex h-[100dvh] min-h-[100dvh] overflow-hidden bg-[var(--bg)]">
      <aside className="hidden h-full w-[82px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--rail)] sm:flex">
        <div className="grid h-[72px] shrink-0 place-items-center border-b border-[var(--line)]">
          <button
            type="button"
            title="WWM Map"
            aria-label="Mở khám phá bản đồ"
            onClick={() => openExplorer("explore")}
            className="grid size-10 place-items-center rounded-[13px] bg-[var(--accent)] text-[var(--accent-ink)] shadow-[0_12px_28px_rgb(215_169_88/0.16)] transition hover:scale-105"
          >
            <Compass size={22} weight="bold" />
          </button>
        </div>

        <nav className="flex flex-col items-center gap-2 border-b border-[var(--line)] p-2.5" aria-label="Điều hướng bản đồ">
          <RailButton
            icon={<ChartDonut size={20} weight="bold" />}
            label="Khám phá và thành tích"
            active={panelOpen && !selectedPOIId}
            onClick={() => openExplorer("progress")}
          />
          <RailButton
            icon={<Sparkle size={20} weight="fill" />}
            label={routeMutation.isPending ? "Đang tìm đường" : "AI hướng dẫn"}
            active={Boolean(route) && !panelOpen}
            disabled={routeMutation.isPending || categories.length === 0}
            onClick={guideToSelectedResources}
          />
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2" aria-label="Chọn khu vực">
          {regionsQuery.data?.map((region) => {
            const active = region.id === activeRegionId;
            const image = REGION_IMAGES[region.id] ?? REGION_IMAGES.OFFICIAL_1;
            return (
              <button
                key={region.id}
                type="button"
                aria-pressed={active}
                title={regionLabel(region)}
                onClick={() => {
                  changeRegion(region.id);
                  setPanelOpen(false);
                }}
                className={`mb-1.5 w-full rounded-[var(--radius-sm)] p-1 transition ${
                  active
                    ? "bg-[var(--surface-strong)] text-[var(--accent-strong)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
                }`}
              >
                <span className={`relative block aspect-[4/3] overflow-hidden rounded-[10px] border ${active ? "border-[var(--accent)]" : "border-[var(--line)]"}`}>
                  <Image src={image} alt="" fill sizes="68px" className="object-cover" />
                  <span className="absolute inset-0 bg-gradient-to-t from-[rgb(5_9_13/0.32)] to-transparent" />
                </span>
                <span className="mt-1 block truncate px-0.5 text-[9px] font-semibold leading-3">
                  {regionLabel(region).split(" (")[0]}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        className="sr-only"
        onChange={(event) => {
          void importProgress(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {panelOpen && (
        <>
          <button
            type="button"
            aria-label="Đóng bảng khám phá"
            onClick={() => setPanelOpen(false)}
            className="absolute inset-0 z-20 bg-[rgb(4_8_12/0.62)] lg:hidden"
          />
          {selectedPOIId ? (
            <POIDetail
              poi={selectedPOIQuery.data}
              loading={selectedPOIQuery.isLoading}
              onClose={() => selectPOI(undefined)}
              onComplete={() => completionMutation.mutate({ id: selectedPOIId, status: "completed" })}
              onUncomplete={() => completionMutation.mutate({ id: selectedPOIId, status: "not_completed" })}
              onProgressChanged={refreshAfterProgressChange}
              onSetRouteStart={() => {
                if (!selectedPOIQuery.data) return;
                setRouteStart(selectedPOIQuery.data.coordinates);
                setRoute(undefined);
                setPickingStart(false);
              }}
              mutationPending={completionMutation.isPending}
            />
          ) : (
            <Sidebar
              key={`${activeRegionId}|${deferredSearch}|${missingOnly}|${categories.join(",")}|${sourceCategory}|${floor}`}
              section={railSection}
              onClose={() => setPanelOpen(false)}
              regions={regionsQuery.data ?? []}
              selectedRegionId={activeRegionId ?? selectedRegionId}
              onRegionChange={changeRegion}
              progress={progressQuery.data}
              progressLoading={progressQuery.isLoading}
              pois={poisQuery.data ?? []}
              poisLoading={poisQuery.isLoading}
              selectedPOIId={selectedPOIId}
              onSelectPOI={(id) => {
                selectPOI(id);
                setPanelOpen(true);
              }}
              search={search}
              onSearchChange={(value) => {
                setSearch(value);
                setRoute(undefined);
              }}
              missingOnly={missingOnly}
              onMissingOnlyChange={setMissingOnly}
              categories={categories}
              onToggleCategory={(category) => {
                toggleCategory(category);
                setRoute(undefined);
              }}
              onShowAllCategories={() => {
                showAllCategories();
                setRoute(undefined);
              }}
              floor={floor}
              onFloorChange={(value) => {
                setFloor(value);
                setRoute(undefined);
              }}
              sourceCategories={sourceCategoriesQuery.data ?? []}
              sourceCategory={sourceCategory}
              onSourceCategoryChange={(value) => {
                setSourceCategory(value);
                setRoute(undefined);
              }}
            />
          )}
        </>
      )}

      <section className="relative min-w-0 flex-1 overflow-hidden" aria-label="Khu vực bản đồ">
        <CompanionMap
          pois={poisQuery.data ?? []}
          region={currentRegion}
          selectedPOIId={selectedPOIId}
          route={route}
          startPoint={activeRouteStart}
          pickingStart={pickingStart}
          dataLoading={poisQuery.isPending}
          panelOpen={panelOpen}
          onSelectPOI={(id) => {
            selectPOI(id);
            setPanelOpen(true);
          }}
          onPickStart={pickRouteStart}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Mở bảng khám phá"
              onClick={() => openExplorer("explore")}
                className="pointer-events-auto grid size-11 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-[var(--line)] bg-[rgb(16_23_31/0.9)] text-[var(--text)] shadow-[0_16px_40px_rgb(2_7_12/0.3)] backdrop-blur-xl sm:hidden"
            >
              <SidebarSimple size={20} weight="bold" />
            </button>
              <label className="pointer-events-auto relative flex h-11 items-center rounded-[var(--radius-sm)] border border-[var(--line)] bg-[rgb(16_23_31/0.9)] pl-3 pr-2 text-[var(--text)] shadow-[0_14px_32px_rgb(2_7_12/0.24)] backdrop-blur-xl" title="Chọn tầng">
                <Stack size={17} weight="bold" className="mr-1.5 shrink-0 text-[var(--accent)]" />
                <span className="sr-only">Tầng</span>
                <select
                  value={floor}
                  onChange={(event) => {
                    setFloor(event.target.value);
                    setRoute(undefined);
                  }}
                  className="h-full max-w-28 appearance-none bg-transparent pr-4 text-[11px] font-semibold text-[var(--text)] outline-none"
                >
                  <option value="all">Tất cả tầng</option>
                  <option value="Surface">Mặt đất</option>
                  <option value="B1">Tầng B1</option>
                  <option value="B2">Tầng B2</option>
                </select>
              </label>
            </div>

            <div className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[rgb(16_23_31/0.9)] p-1 shadow-[0_14px_32px_rgb(2_7_12/0.24)] backdrop-blur-xl">
              <MapActionButton
                label={routeStart ? "Đổi điểm bắt đầu" : "Ghim điểm bắt đầu"}
                active={pickingStart}
                onClick={() => setPickingStart((value) => !value)}
                icon={<Crosshair size={18} weight="bold" />}
              />
              <MapActionButton
                label="Nhập tiến độ JSON"
                onClick={() => importInputRef.current?.click()}
                icon={<UploadSimple size={18} weight="bold" />}
              />
              <MapActionButton
                label="Xuất tiến độ JSON"
                onClick={() => void exportProgress()}
                icon={<DownloadSimple size={18} weight="bold" />}
              />
              <MapActionButton
                label={routeMutation.isPending ? "Đang tìm đường" : `AI dẫn đường tìm ${selectedCategoryLabel}`}
                active={Boolean(route)}
                accent
                disabled={routeMutation.isPending || categories.length === 0}
                onClick={guideToSelectedResources}
                icon={<Sparkle size={18} weight="fill" />}
              />
            </div>
          </div>

          <div className="pointer-events-auto absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[rgb(16_23_31/0.92)] p-1 shadow-[0_18px_42px_rgb(2_7_12/0.28)] backdrop-blur-xl sm:top-4 max-lg:top-[66px]">
            {CATEGORY_ORDER.map((category) => (
              <ResourceFilterButton
                key={category}
                category={category}
                active={categories.includes(category)}
                onClick={() => toggleResource(category)}
              />
            ))}
            <span className="mx-0.5 h-6 w-px bg-[var(--line)]" />
            <button
              type="button"
              title="Hiện tất cả tài nguyên"
              aria-label="Hiện tất cả tài nguyên"
              onClick={() => {
                showAllCategories();
                setRoute(undefined);
              }}
              className={`grid size-9 place-items-center rounded-[10px] transition ${
                categories.length === CATEGORY_ORDER.length
                  ? "bg-[var(--surface-strong)] text-[var(--accent-strong)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)]"
              }`}
            >
              <StackSimple size={17} weight="bold" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => openExplorer("progress")}
            className="pointer-events-auto absolute left-4 top-[72px] hidden max-w-[260px] items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[rgb(16_23_31/0.86)] px-3 py-2 text-left shadow-[0_14px_32px_rgb(2_7_12/0.22)] backdrop-blur-xl transition hover:bg-[rgb(25_34_44/0.92)] lg:flex"
          >
            <MapTrifold size={16} className="shrink-0 text-[var(--accent)]" />
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold">{regionLabel(currentRegion)}</span>
              <span className="mt-0.5 flex items-center gap-1 text-[9px] text-[var(--muted)]">
                <MapPinLine size={11} weight="bold" /> {progressSummary(progressQuery.data)}
              </span>
            </span>
          </button>
        </div>

        {pickingStart && (
          <div className="pointer-events-none absolute left-1/2 top-20 z-10 flex w-[min(420px,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] bg-[rgb(19_25_31/0.94)] p-3 shadow-[0_20px_50px_rgb(2_8_6/0.32)] backdrop-blur-xl">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]"><Crosshair size={18} weight="bold" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold">Chọn điểm bắt đầu</span>
              <span className="mt-0.5 block text-[10px] text-[var(--muted)]">Nhấp lên bản đồ tại vị trí nhân vật đang đứng.</span>
            </span>
            <button
              type="button"
              aria-label="Hủy chọn điểm bắt đầu"
              onClick={() => setPickingStart(false)}
              className="pointer-events-auto grid size-8 place-items-center rounded-full bg-[var(--surface-strong)] text-[var(--muted)] hover:text-[var(--text)]"
            >
              <X size={14} weight="bold" />
            </button>
          </div>
        )}

        {route && nextPOI && (
          <button
            type="button"
            onClick={() => selectPOI(nextPOI.id)}
            className="absolute bottom-4 left-1/2 z-10 flex w-[min(480px,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--accent)_38%,var(--line))] bg-[rgb(20_27_25/0.94)] p-3 text-left shadow-[0_20px_50px_rgb(2_8_6/0.34)] backdrop-blur-xl transition hover:-translate-y-0.5"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]">
              <NavigationArrow size={19} weight="fill" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold text-[var(--muted)]">AI ĐANG DẪN TÌM {selectedCategoryLabel.toLocaleUpperCase("vi")}</span>
              <span className="block truncate text-sm font-semibold">{nextPOI.name}</span>
            </span>
            <span className="shrink-0 text-right font-mono text-[10px] text-[var(--muted)]">
              <span className="block text-[var(--accent)]">{route.stops.length} điểm</span>
              <span className="mt-1 block">chi phí {route.total_cost.toFixed(1)}</span>
            </span>
          </button>
        )}

        {routeMutation.isError && (
          <div className="absolute right-4 top-20 z-10 rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-xs text-[var(--danger)]">
            {routeMutation.error.message}
          </div>
        )}

        {transferMessage && (
          <div className="absolute bottom-4 left-4 z-10 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[rgb(16_23_31/0.94)] px-3 py-2 text-xs text-[var(--text)] shadow-[0_14px_32px_rgb(2_7_12/0.3)] backdrop-blur-xl">
            {transferMessage}
          </div>
        )}

        {apiUnavailable && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-[rgb(13_18_17/0.92)] p-6 backdrop-blur-sm">
            <div className="max-w-sm rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--surface)] p-6 text-center">
              <ArrowClockwise size={30} className="mx-auto text-[var(--accent)]" />
              <h1 className="mt-4 text-lg font-semibold">Dịch vụ cục bộ chưa chạy</h1>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Hãy chạy ứng dụng từ thư mục dự án, sau đó thử kết nối lại.</p>
              <button
                type="button"
                onClick={() => void healthQuery.refetch()}
                className="mt-5 h-10 rounded-[var(--radius)] bg-[var(--accent)] px-5 text-sm font-bold text-[var(--accent-ink)]"
              >
                Thử lại
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function ResourceFilterButton({
  category,
  active,
  onClick,
}: {
  category: POICategory;
  active: boolean;
  onClick: () => void;
}) {
  const color = CATEGORY_COLORS[category];
  return (
    <button
      type="button"
      title={CATEGORY_LABELS[category]}
      aria-label={`${active ? "Ẩn" : "Hiện"} ${CATEGORY_LABELS[category]}`}
      aria-pressed={active}
      onClick={onClick}
      style={{ color: active ? color : undefined }}
      className={`relative grid size-9 place-items-center rounded-[10px] transition duration-300 ${
        active
          ? "bg-[var(--surface-strong)] shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]"
          : "text-[var(--subtle)] opacity-55 hover:bg-[var(--surface)] hover:opacity-100"
      }`}
    >
      <POIIcon category={category} size={18} />
      {active && <span className="absolute inset-x-2 bottom-0.5 h-0.5 rounded-full" style={{ backgroundColor: color }} />}
    </button>
  );
}

function MapActionButton({
  icon,
  label,
  active = false,
  accent = false,
  disabled = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  accent?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-9 place-items-center rounded-[10px] transition ${
        accent
          ? "bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]"
          : active
            ? "bg-[var(--surface-strong)] text-[var(--accent-strong)]"
            : "text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)]"
      } disabled:cursor-not-allowed disabled:opacity-45`}
    >
      {icon}
    </button>
  );
}

function RailButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`relative grid size-11 place-items-center rounded-[var(--radius-sm)] transition duration-300 ${
        active
          ? "bg-[var(--surface-strong)] text-[var(--accent)] shadow-[inset_0_1px_0_rgb(255_255_255/0.035)]"
          : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
      } disabled:cursor-not-allowed disabled:opacity-45`}
    >
      {icon}
      {active && <span className="absolute -right-2.5 h-5 w-0.5 rounded-full bg-[var(--accent)]" />}
    </button>
  );
}
