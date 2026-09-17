"use client";

import type { Feature, FeatureCollection } from "geojson";
import { NavigationArrow } from "@phosphor-icons/react/ssr";
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isWaypointCategory, POIIcon } from "@/components/poi-icon";
import { CATEGORY_COLORS } from "@/lib/poi";
import type { POI, Region, RouteResult } from "@/lib/types";

interface CompanionMapProps {
  pois: POI[];
  region?: Region;
  selectedPOIId?: string;
  route?: RouteResult;
  startPoint?: [number, number];
  pickingStart: boolean;
  dataLoading: boolean;
  panelOpen: boolean;
  onSelectPOI: (id: string) => void;
  onPickStart: (coordinates: [number, number]) => void;
}

interface MarkerEntry {
  marker: Marker;
  element: HTMLButtonElement;
}

const EMPTY_COLLECTION: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const MARKER_ICON_CACHE = new Map<string, string>();
const START_MARKER_MARKUP = renderToStaticMarkup(
  <>
    <span className="wwm-start-marker__icon"><NavigationArrow size={17} weight="fill" /></span>
    <span className="wwm-start-marker__label">Bắt đầu</span>
  </>,
);

function markerIconMarkup(poi: POI): string {
  const key = poi.source_category ?? poi.category;
  const cached = MARKER_ICON_CACHE.get(key);
  if (cached) return cached;
  const markup = renderToStaticMarkup(
    <POIIcon category={poi.category} sourceCategory={poi.source_category} size={14} weight="fill" />,
  );
  MARKER_ICON_CACHE.set(key, markup);
  return markup;
}

function updateGeoJSONSource(map: MapLibreMap, sourceID: string, data: FeatureCollection) {
  const apply = () => {
    const source = map.getSource(sourceID) as GeoJSONSource | undefined;
    if (!source) return false;
    source.setData(data);
    return true;
  };
  if (apply()) return () => undefined;
  const onStyleData = () => {
    if (apply()) map.off("styledata", onStyleData);
  };
  map.on("styledata", onStyleData);
  return () => {
    map.off("styledata", onStyleData);
  };
}

function baseStyle(region?: Region): StyleSpecification {
  const sources: StyleSpecification["sources"] = {
    route: { type: "geojson", data: EMPTY_COLLECTION },
    entrance: { type: "geojson", data: EMPTY_COLLECTION },
  };
  const layers: StyleSpecification["layers"] = [
    { id: "background", type: "background", paint: { "background-color": "#0f1714" } },
  ];

  if (region?.tile_url) {
    const tileURL = region.tile_url.startsWith("/") ? `${window.location.origin}${region.tile_url}` : region.tile_url;
    sources["official-map"] = {
      type: "raster",
      tiles: [tileURL],
      bounds: [region.bounds[0][0], region.bounds[0][1], region.bounds[1][0], region.bounds[1][1]],
      tileSize: 256,
      minzoom: region.min_zoom,
      maxzoom: region.max_zoom,
      attribution: `<a href="https://www.wherewindsmeetgame.com/map/" target="_blank" rel="noreferrer">${region.attribution ?? "Bản đồ Where Winds Meet chính thức"}</a>`,
    };
    layers.push({ id: "official-map", type: "raster", source: "official-map" });
  }

  layers.push(
    {
      id: "route-shadow",
      type: "line",
      source: "route",
      paint: { "line-color": "#0b100e", "line-width": 8, "line-opacity": 0.55 },
    },
    {
      id: "route-line",
      type: "line",
      source: "route",
      paint: { "line-color": "#e0b662", "line-width": 3.5, "line-opacity": 0.96, "line-dasharray": [1.2, 1.1] },
    },
    {
      id: "entrance-line",
      type: "line",
      source: "entrance",
      paint: { "line-color": "#e0b662", "line-width": 1.6, "line-dasharray": [1, 2], "line-opacity": 0.82 },
    },
    {
      id: "entrance-point",
      type: "circle",
      source: "entrance",
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-color": "#0f1714", "circle-radius": 5, "circle-stroke-color": "#e0b662", "circle-stroke-width": 2 },
    },
  );

  return { version: 8, name: "WWM official map", sources, layers };
}

export function CompanionMap({
  pois,
  region,
  selectedPOIId,
  route,
  startPoint,
  pickingStart,
  dataLoading,
  panelOpen,
  onSelectPOI,
  onPickStart,
}: CompanionMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const currentRegionIDRef = useRef<string | undefined>(undefined);
  const markersRef = useRef(new Map<string, MarkerEntry>());
  const startMarkerRef = useRef<{ marker: Marker; element: HTMLDivElement } | undefined>(undefined);
  const onSelectRef = useRef(onSelectPOI);
  const onPickStartRef = useRef(onPickStart);
  const pickingStartRef = useRef(pickingStart);
  const regionRef = useRef(region);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mapError, setMapError] = useState<string>();
  const [mapRevision, setMapRevision] = useState(0);
  const [regionTransitioning, setRegionTransitioning] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const regionAvailable = Boolean(region);

  useEffect(() => {
    onSelectRef.current = onSelectPOI;
  }, [onSelectPOI]);

  useEffect(() => {
    onPickStartRef.current = onPickStart;
  }, [onPickStart]);

  useEffect(() => {
    pickingStartRef.current = pickingStart;
    containerRef.current?.classList.toggle("wwm-map--picking", pickingStart);
  }, [pickingStart]);

  useEffect(() => {
    regionRef.current = region;
  }, [region]);

  useEffect(() => {
    const initialRegion = regionRef.current;
    if (!containerRef.current || mapRef.current || !initialRegion || !regionAvailable) return;
    const markerEntries = markersRef.current;

    setMapStatus("loading");
    setMapError(undefined);
    const map = new MapLibreMap({
      container: containerRef.current,
      style: baseStyle(initialRegion),
      center: initialRegion.center,
      zoom: initialRegion.initial_zoom ?? 10.2,
      minZoom: initialRegion.min_zoom ?? 7,
      maxZoom: initialRegion.max_zoom ?? 16,
      maxBounds: initialRegion.bounds,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });

    currentRegionIDRef.current = initialRegion.id;
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");

    let timeout = 0;
    const handleReady = () => {
      window.clearTimeout(timeout);
      setMapStatus("ready");
      setMapError(undefined);
      setMapRevision((revision) => revision + 1);
      map.resize();
    };
    const handleMapError = () => {
      setMapError("Một số ô bản đồ chưa tải được. Ứng dụng sẽ tiếp tục thử tải trong nền.");
    };
    const handleMapClick = (event: { lngLat: { lng: number; lat: number } }) => {
      if (!pickingStartRef.current) return;
      onPickStartRef.current([event.lngLat.lng, event.lngLat.lat]);
    };
    timeout = window.setTimeout(() => {
      setMapStatus((status) => (status === "loading" ? "error" : status));
      setMapError((message) => message ?? "Bản đồ tải quá lâu. Hãy thử tải lại.");
    }, 12_000);
    map.once("render", handleReady);
    map.on("error", handleMapError);
    map.on("click", handleMapClick);

    mapRef.current = map;
    return () => {
      window.clearTimeout(timeout);
      map.off("render", handleReady);
      map.off("error", handleMapError);
      map.off("click", handleMapClick);
      markerEntries.forEach(({ marker }) => marker.remove());
      markerEntries.clear();
      startMarkerRef.current?.marker.remove();
      startMarkerRef.current = undefined;
      map.remove();
      mapRef.current = null;
    };
  }, [regionAvailable, retryKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !region || currentRegionIDRef.current === region.id) return;

    currentRegionIDRef.current = region.id;
    setRegionTransitioning(true);
    setMapError(undefined);
    map.setMaxBounds(null);
    map.setMinZoom(region.min_zoom ?? 7);
    map.setMaxZoom(region.max_zoom ?? 16);
    map.setStyle(baseStyle(region), { diff: false });
    map.easeTo({ center: region.center, zoom: region.initial_zoom ?? 10.2, duration: 900 });
    map.setMaxBounds(region.bounds);

    let timeout = 0;
    const finishTransition = () => {
      window.clearTimeout(timeout);
      setRegionTransitioning(false);
      setMapRevision((revision) => revision + 1);
    };
    map.once("idle", finishTransition);
    timeout = window.setTimeout(finishTransition, 2500);
    return () => {
      window.clearTimeout(timeout);
      map.off("idle", finishTransition);
    };
  }, [region]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const routeIDs = new Set(route?.stops.map((stop) => stop.poi.id));
    const nextID = route?.stops[0]?.poi.id;

    const syncVisibleMarkers = () => {
      const bounds = map.getBounds();
      const visiblePOIs = pois.filter((poi) => bounds.contains(poi.coordinates)).slice(0, 300);
      const visibleIDs = new Set(visiblePOIs.map((poi) => poi.id));

      markersRef.current.forEach((entry, id) => {
        if (!visibleIDs.has(id)) {
          entry.marker.remove();
          markersRef.current.delete(id);
        }
      });

      visiblePOIs.forEach((poi, index) => {
        let entry = markersRef.current.get(poi.id);
        if (!entry) {
          const element = document.createElement("button");
          element.type = "button";
          element.className = "wwm-map-marker";
          element.innerHTML = markerIconMarkup(poi);
          element.style.setProperty("--marker-color", CATEGORY_COLORS[poi.category]);
          element.style.setProperty("--marker-delay", `${Math.min(index, 18) * 18}ms`);
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            onSelectRef.current(poi.id);
          });
          const anchor = isWaypointCategory(poi.source_category) ? "center" : "bottom";
          const marker = new Marker({ element, anchor }).setLngLat(poi.coordinates).addTo(map);
          entry = { marker, element };
          markersRef.current.set(poi.id, entry);
        } else {
          entry.marker.setLngLat(poi.coordinates);
        }

        entry.element.setAttribute(
          "aria-label",
          `${poi.name}, ${poi.status === "completed" ? "đã hoàn thành" : "chưa hoàn thành"}`,
        );
        entry.element.dataset.status = poi.status;
        entry.element.dataset.selected = String(poi.id === selectedPOIId);
        entry.element.dataset.category = poi.category;
        entry.element.dataset.markerShape = isWaypointCategory(poi.source_category) ? "waypoint" : "pin";
        entry.element.dataset.sourceCategory = poi.source_category ?? "unknown";
        entry.element.dataset.route = String(routeIDs.has(poi.id));
        entry.element.dataset.next = String(poi.id === nextID);
      });
    };

    syncVisibleMarkers();
    map.on("moveend", syncVisibleMarkers);
    return () => {
      map.off("moveend", syncVisibleMarkers);
    };
  }, [mapRevision, pois, route, selectedPOIId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!startPoint) {
      startMarkerRef.current?.marker.remove();
      startMarkerRef.current = undefined;
      return;
    }

    if (!startMarkerRef.current) {
      const element = document.createElement("div");
      element.className = "wwm-start-marker";
      element.setAttribute("role", "img");
      element.setAttribute("aria-label", "Điểm bắt đầu lộ trình");
      element.innerHTML = START_MARKER_MARKUP;
      const marker = new Marker({ element, anchor: "bottom" }).setLngLat(startPoint).addTo(map);
      startMarkerRef.current = { marker, element };
    } else {
      startMarkerRef.current.marker.setLngLat(startPoint);
    }
    startMarkerRef.current.element.dataset.picking = String(pickingStart);
  }, [mapRevision, pickingStart, startPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const geometry = route?.geometry;
    const data: FeatureCollection = geometry
      ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry }] }
      : EMPTY_COLLECTION;
    return updateGeoJSONSource(map, "route", data);
  }, [mapRevision, route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const selected = pois.find((poi) => poi.id === selectedPOIId);
    const features: Feature[] = [];
    if (selected?.entrance_coordinates) {
      features.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: selected.entrance_coordinates } });
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [selected.entrance_coordinates, selected.coordinates] },
      });
    }
    return updateGeoJSONSource(map, "entrance", { type: "FeatureCollection", features });
  }, [mapRevision, pois, selectedPOIId]);

  useEffect(() => {
    const selected = pois.find((poi) => poi.id === selectedPOIId);
    if (selected) mapRef.current?.easeTo({ center: selected.coordinates, zoom: 13.4, duration: 700 });
  }, [pois, selectedPOIId]);

  useEffect(() => {
    const map = mapRef.current;
    const coordinates = route?.geometry.coordinates;
    if (!map || !coordinates || coordinates.length < 2) return;
    const bounds = coordinates.reduce(
      (routeBounds, coordinates) => routeBounds.extend(coordinates),
      new LngLatBounds(coordinates[0], coordinates[0]),
    );
    map.fitBounds(bounds, { padding: { top: 96, right: 72, bottom: 120, left: 72 }, duration: 850, maxZoom: 13.2 });
  }, [route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.resize();
    const frame = window.requestAnimationFrame(() => map.resize());
    return () => window.cancelAnimationFrame(frame);
  }, [panelOpen]);

  return (
    <div className="relative h-full w-full" aria-label="Bản đồ hoàn thành tương tác">
      <div ref={containerRef} className="h-full w-full" />
      {mapStatus === "loading" && mapRevision === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[var(--bg)]" role="status" aria-live="polite">
          <div className="skeleton h-12 w-44 rounded-[var(--radius)]" />
        </div>
      )}
      {regionTransitioning && (
        <div
          className="pointer-events-none absolute inset-0 grid place-items-center bg-[rgb(7_11_16/0.48)] backdrop-blur-[2px] motion-safe:animate-[map-fade_260ms_ease-out]"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-full border border-[var(--line)] bg-[rgb(16_23_31/0.92)] px-4 py-2.5 text-[11px] font-semibold text-[var(--muted)] shadow-[0_12px_28px_rgb(2_7_12/0.28)] backdrop-blur-xl">
            Đang chuyển khu vực
          </div>
        </div>
      )}
      {dataLoading && mapStatus === "ready" && !regionTransitioning && (
        <div className="pointer-events-none absolute left-1/2 top-20 -translate-x-1/2 rounded-full border border-[var(--line)] bg-[rgb(16_23_31/0.88)] px-3 py-2 text-[11px] font-semibold text-[var(--muted)] shadow-[0_12px_28px_rgb(2_7_12/0.28)] backdrop-blur-xl">
          Đang cập nhật địa điểm
        </div>
      )}
      {mapStatus === "error" && (
        <div className="absolute inset-0 grid place-items-center bg-[rgb(13_18_17/0.88)] p-6 backdrop-blur-sm">
          <div className="max-w-sm rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--surface)] p-5 text-center">
            <p className="text-sm font-semibold">Chưa tải được nền bản đồ</p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{mapError}</p>
            <button
              type="button"
              onClick={() => setRetryKey((value) => value + 1)}
              className="mt-4 h-10 rounded-[var(--radius)] bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)]"
            >
              Tải lại bản đồ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
