"use client";

import { useMutation } from "@tanstack/react-query";
import { CheckCircle, ClipboardText, ImageSquare, WarningCircle, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { AnalysisResult, POI } from "@/lib/types";

interface ScreenshotAnalyzerProps {
  poi: POI;
  onCompleted: () => void;
  onManualComplete: () => void;
}

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function ScreenshotAnalyzer({ poi, onCompleted, onManualComplete }: ScreenshotAnalyzerProps) {
  const [file, setFile] = useState<File>();
  const [note, setNote] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  const analysis = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Hãy chọn ảnh chụp màn hình trước.");
      return api.analyzeScreenshot({ poiId: poi.id, image: file, note });
    },
    onSuccess: (result) => {
      if (result.status === "completed") onCompleted();
    },
  });

  function chooseFile(next?: File) {
    if (!next) return;
    if (!ACCEPTED_TYPES.has(next.type)) {
      analysis.reset();
      setFileError("Chỉ hỗ trợ ảnh PNG, JPEG hoặc WebP.");
      return;
    }
    setFileError(undefined);
    setFile(next);
    analysis.reset();
  }

  const previewURL = useMemo(() => (file ? URL.createObjectURL(file) : undefined), [file]);

  useEffect(() => {
    return () => {
      if (previewURL) URL.revokeObjectURL(previewURL);
    };
  }, [previewURL]);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;
      const pasted = Array.from(event.clipboardData?.items ?? []).find((item) => item.type.startsWith("image/"));
      const pastedFile = pasted?.getAsFile();
      if (pastedFile) chooseFile(pastedFile);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const result = analysis.data;

  return (
    <section className="border-t border-[var(--line)] pt-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Kiểm tra bằng ảnh chụp</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">Ảnh sẽ được phân tích theo đúng địa điểm đang chọn.</p>
        </div>
        <span className="rounded-lg border border-[var(--line)] px-2 py-1 font-mono text-[10px] text-[var(--muted)]">CTRL+V</span>
      </div>

      {previewURL ? (
        <div className="relative overflow-hidden rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--surface-soft)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewURL} alt="Ảnh chụp sẵn sàng để phân tích" className="max-h-44 w-full object-contain" />
          <button
            type="button"
            aria-label="Xóa ảnh chụp"
            onClick={() => {
              setFile(undefined);
              analysis.reset();
            }}
            className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text)]"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            chooseFile(event.dataTransfer.files[0]);
          }}
          className={`grid min-h-36 w-full place-items-center rounded-[var(--radius)] border border-dashed px-5 text-center transition-colors ${
            dragActive
              ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_9%,transparent)]"
              : "border-[var(--line-strong)] bg-[var(--surface-soft)] hover:bg-[var(--surface)]"
          }`}
        >
          <span>
            <ClipboardText size={30} weight="duotone" className="mx-auto text-[var(--accent)]" />
            <span className="mt-3 block text-sm font-semibold">Dán ảnh chụp màn hình</span>
            <span className="mt-1 block text-xs text-[var(--muted)]">Nhấn CTRL + V, kéo thả ảnh hoặc chọn tệp</span>
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(event) => chooseFile(event.target.files?.[0])}
      />

      {fileError && (
        <p className="mt-3 text-xs text-[var(--danger)]" role="alert">
          {fileError}
        </p>
      )}

      {file && (
        <div className="mt-3 space-y-3">
          <label className="block text-xs font-medium text-[var(--muted)]" htmlFor="analysis-note">
            Ghi chú (không bắt buộc)
            <input
              id="analysis-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Dấu hiệu hoàn thành nào cần xuất hiện?"
              className="mt-2 h-10 w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--subtle)]"
            />
          </label>
          <button
            type="button"
            disabled={analysis.isPending}
            onClick={() => analysis.mutate()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            <ImageSquare size={18} weight="bold" />
            {analysis.isPending ? "Đang phân tích bằng chứng" : "Phân tích ảnh chụp"}
          </button>
        </div>
      )}

      {analysis.isError && (
        <div className="mt-3 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--danger)_55%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_9%,transparent)] p-3 text-xs text-[var(--danger)]">
          {analysis.error.message}
        </div>
      )}

      {result && <AnalysisResultView result={result} onRetry={() => analysis.mutate()} onManualComplete={onManualComplete} />}
    </section>
  );
}

function AnalysisResultView({
  result,
  onRetry,
  onManualComplete,
}: {
  result: AnalysisResult;
  onRetry: () => void;
  onManualComplete: () => void;
}) {
  const completed = result.status === "completed";
  const uncertain = result.status === "uncertain";
  return (
    <div className="mt-3 rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--surface-strong)] p-4">
      <div className="flex items-start gap-3">
        {completed ? (
          <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-[var(--success)]" />
        ) : (
          <WarningCircle size={22} weight="duotone" className="mt-0.5 shrink-0 text-[var(--accent)]" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {completed ? "Đã xác nhận hoàn thành" : uncertain ? "Không đủ bằng chứng." : "Chưa hoàn thành"}
          </p>
          <p className="mt-1 font-mono text-[10px] text-[var(--muted)]">
            Độ tin cậy {Math.round(result.confidence * 100)}% | {result.provider} | {result.cached ? "từ bộ nhớ đệm" : "phân tích mới"}
          </p>
          {result.evidence.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs leading-5 text-[var(--muted)]">
              {result.evidence.map((evidence) => (
                <li key={evidence}>{evidence}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {!completed && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="h-9 rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text)]"
          >
            Phân tích lại
          </button>
          <button
            type="button"
            onClick={onManualComplete}
            className="h-9 rounded-[var(--radius)] bg-[var(--accent)] px-3 text-xs font-bold text-[var(--accent-ink)]"
          >
            Tự đánh dấu đã xong
          </button>
        </div>
      )}
    </div>
  );
}
