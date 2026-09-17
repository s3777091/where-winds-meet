"use client";

import {
  ArrowCounterClockwise,
  CheckCircle,
  DoorOpen,
  Flag,
  Footprints,
  ImageSquare,
  MapPin,
  MapPinLine,
  Mountains,
  X,
} from "@phosphor-icons/react";
import type { POI } from "@/lib/types";
import { CATEGORY_LABELS, entranceLabel, floorLabel, sourceCategoryLabel } from "@/lib/poi";
import { ScreenshotAnalyzer } from "./screenshot-analyzer";

interface POIDetailProps {
  poi?: POI;
  loading: boolean;
  onClose: () => void;
  onComplete: () => void;
  onUncomplete: () => void;
  onProgressChanged: () => void;
  onSetRouteStart: () => void;
  mutationPending: boolean;
}

export function POIDetail(props: POIDetailProps) {
  if (props.loading) {
    return (
      <aside className="wwm-panel-enter relative z-30 h-full w-[400px] shrink-0 border-r border-[var(--line)] bg-[var(--surface-soft)] p-5 shadow-[18px_0_48px_rgb(2_7_12/0.2)] max-xl:w-[380px] max-lg:absolute max-lg:inset-y-0 max-lg:left-16 max-sm:left-0 max-sm:w-full">
        <div className="skeleton h-8 w-4/5 rounded-lg" />
        <div className="skeleton mt-4 h-24 rounded-[var(--radius)]" />
        <div className="skeleton mt-4 h-64 rounded-[var(--radius)]" />
      </aside>
    );
  }

  if (!props.poi) return null;
  const poi = props.poi;

  return (
    <aside className="wwm-panel-enter relative z-30 h-full w-[400px] shrink-0 overflow-y-auto border-r border-[var(--line)] bg-[var(--surface-soft)] shadow-[18px_0_48px_rgb(2_7_12/0.2)] max-xl:w-[380px] max-lg:absolute max-lg:inset-y-0 max-lg:left-16 max-sm:left-0 max-sm:w-full">
      <div className="sticky top-0 z-10 flex min-h-[88px] items-center justify-between border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--surface-soft)_94%,transparent)] px-5 py-4 backdrop-blur-xl">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-[var(--accent)]">
            {poi.source_category ? sourceCategoryLabel(poi.source_category, true) : CATEGORY_LABELS[poi.category]} | {poi.id}
          </p>
          <h2 className="mt-1 truncate text-lg font-semibold tracking-[-0.02em]">{poi.name}</h2>
        </div>
        <button
          type="button"
          aria-label="Đóng chi tiết địa điểm"
          onClick={props.onClose}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--surface-strong)] text-[var(--muted)] hover:text-[var(--text)]"
        >
          <X size={17} />
        </button>
      </div>

      <div className="space-y-6 p-5">
        <section className="grid grid-cols-2 gap-2">
          <Fact icon={<MapPin />} label="Loại chính thức" value={sourceCategoryLabel(poi.source_category, true)} />
          <Fact icon={<Mountains />} label="Tầng" value={floorLabel(poi.floor)} />
          <div className="col-span-2">
            <Fact icon={<DoorOpen />} label="Lối vào" value={entranceLabel(poi.entrance)} />
          </div>
        </section>

        {(poi.reference_images?.length ?? 0) > 0 ? (
          <section>
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <ImageSquare size={17} className="text-[var(--accent)]" /> Ảnh tham chiếu
              </h3>
              <span className="text-[10px] text-[var(--subtle)]">
                {poi.guide_provenance?.verification_status === "verified" ? "Ảnh thật, đã kiểm chứng" : "Ảnh thật từ nguồn cộng đồng"}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(poi.reference_images ?? []).map((image) => (
                <a
                  key={`${image.url}|${image.source_url}`}
                  href={image.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="group overflow-hidden rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] transition hover:border-[var(--line-strong)]"
                >
                  {/* Curated guide URLs are validated by the API and remain unoptimized to preserve source fidelity. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={image.alt}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  />
                  {image.caption && <p className="p-2 text-[10px] leading-4 text-[var(--muted)]">{image.caption}</p>}
                </a>
              ))}
            </div>
          </section>
        ) : (
          <section className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex items-start gap-3">
              <ImageSquare size={18} className="mt-0.5 shrink-0 text-[var(--subtle)]" />
              <div>
                <p className="text-xs font-semibold text-[var(--muted)]">Chưa có ảnh tham chiếu đã xác minh</p>
                <p className="mt-1 text-[10px] leading-4 text-[var(--subtle)]">
                  Ứng dụng không tự tạo ảnh hoặc hướng dẫn cho điểm này. Dữ liệu chỉ xuất hiện sau khi được đối chiếu nguồn và kiểm tra trong game.
                </p>
              </div>
            </div>
          </section>
        )}

        {poi.navigation_steps.length > 0 && <section>
          <h3 className="text-sm font-semibold">Cách đến địa điểm</h3>
          <ol className="mt-3 space-y-3">
            {poi.navigation_steps.map((step, index) => (
              <li key={step} className="grid grid-cols-[24px_1fr] gap-3 text-sm leading-5 text-[var(--muted)]">
                <span className="grid size-6 place-items-center rounded-lg border border-[var(--line)] font-mono text-[10px] text-[var(--accent)]">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>}

        {poi.solution_steps.length > 0 && <section>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Cách hoàn thành</h3>
            {poi.guide_provenance?.verification_status === "source_synced" && (
              <span className="text-[10px] text-[var(--subtle)]">Bản dịch máy từ nguồn</span>
            )}
          </div>
          <ol className="mt-3 space-y-3">
            {poi.solution_steps.map((step, index) => (
              <li key={step} className="grid grid-cols-[24px_1fr] gap-3 text-sm leading-5 text-[var(--muted)]">
                <span className="grid size-6 place-items-center rounded-lg border border-[var(--line)] font-mono text-[10px] text-[var(--accent)]">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>}

        {poi.requirements.length > 0 && (
          <section className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Flag size={17} className="text-[var(--accent)]" /> Yêu cầu
            </div>
            <p className="mt-2 text-sm leading-5 text-[var(--muted)]">{poi.requirements.join(", ")}</p>
          </section>
        )}

        {poi.common_mistake && (
          <section className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Footprints size={17} className="text-[var(--accent)]" /> Lỗi thường gặp
            </div>
            <p className="mt-2 text-sm leading-5 text-[var(--muted)]">{poi.common_mistake}</p>
          </section>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={props.onSetRouteStart}
            className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-strong)]"
          >
            <MapPinLine size={18} weight="bold" /> Dùng làm điểm bắt đầu
          </button>
          {poi.status === "completed" ? (
            <button
              type="button"
              disabled={props.mutationPending}
              onClick={props.onUncomplete}
              className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] text-sm font-semibold text-[var(--text)] disabled:opacity-50"
            >
              <ArrowCounterClockwise size={17} /> Đánh dấu chưa xong
            </button>
          ) : (
            <button
              type="button"
              disabled={props.mutationPending}
              onClick={props.onComplete}
              className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)] disabled:opacity-50"
            >
              <CheckCircle size={18} weight="bold" /> Đánh dấu đã xong
            </button>
          )}
        </div>

        <ScreenshotAnalyzer poi={poi} onCompleted={props.onProgressChanged} onManualComplete={props.onComplete} />

        <section className="border-t border-[var(--line)] pt-4 text-[10px] leading-4 text-[var(--subtle)]">
          <p>Nguồn: {poi.provenance.source}</p>
          <p>Xác minh: {poi.provenance.verification_status === "verified" ? "đã xác minh" : poi.provenance.verification_status}</p>
          <p>Phiên bản dữ liệu: {poi.provenance.patch_version}</p>
          {poi.provenance.source_url && (
            <p>
              <a href={poi.provenance.source_url} target="_blank" rel="noreferrer" className="underline hover:text-[var(--text)]">
                Mở nguồn chính thức
              </a>
            </p>
          )}
          {poi.guide_provenance && (
            <>
              <p className="mt-2">Hướng dẫn: {poi.guide_provenance.source}</p>
              <p>
                Trạng thái: {poi.guide_provenance.verification_status === "verified" ? "đã kiểm chứng trong game" : "đồng bộ từ nguồn"}
              </p>
              <p>Kiểm tra lần cuối: {poi.guide_provenance.last_verified_date ?? "không rõ"}</p>
              <p>
                <a href={poi.guide_provenance.source_url} target="_blank" rel="noreferrer" className="underline hover:text-[var(--text)]">
                  Mở nguồn hướng dẫn
                </a>
              </p>
            </>
          )}
        </section>
      </div>
    </aside>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-h-20 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted)]">
        <span className="text-[var(--accent)]">{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-sm font-semibold leading-5 text-[var(--text)]">{value}</p>
    </div>
  );
}
