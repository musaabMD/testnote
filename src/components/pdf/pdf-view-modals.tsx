"use client";

import { getQuestionText } from "@/components/pdf/pdf-study-panel";
import {
  getSourcePreview,
  isImagePreviewMime,
  isPdfPreviewMime,
  MIN_HIGHLIGHT_CONFIDENCE,
  normalizeSourceRegion,
  type SourceRegion,
} from "@/lib/highlightable-source";
import {
  isValidHighlightRegion,
  resolveFinalHighlightRegion,
  type NormalizedRegion,
} from "@/lib/pdf-source-region";
import { getPdfJs, openPdfDocument } from "@/lib/pdf-document";
import {
  loadQuestionSourcePage,
  type SourcePageState,
} from "@/lib/source-page-loader";
import { recordClientAuditEvent } from "@/lib/audit-events.client";
import type { PagePreviewLoadResult } from "@/lib/pdf-source-page-cache";
import type { SourceChunk } from "@/lib/highlightable-source";
import {
  filterChunksForPage,
  findChunkForQuestion,
  isSourceDebugAvailable,
  isSourceDebugEnabled,
  toggleSourceDebugEnabled,
} from "@/lib/source-debug";
import { logSourceViewEvent, type SourceViewTelemetry } from "@/lib/source-telemetry";
import {
  SourceDebugLegend,
  SourceDebugOverlay,
} from "@/components/pdf/source-debug-overlay";
import type { PdfMcq, PdfSource } from "@/lib/pdf-mcqs";
import { buildQuizAssistantInstructions } from "@/lib/quiz-tutor-prompt";
import { streamTutorReply } from "@/lib/tutor-chat-client";
import { FileText, Send, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ChatMessage = { role: "assistant" | "user"; text: string };

export type SourcePreview = {
  fileId?: string;
  questionId?: string;
  source: PdfSource;
  previewUrl?: string;
  previewMimeType?: string;
  pageNumber: number;
  imageUrl?: string;
  questionText?: string;
  questionNumber?: number;
  optionTexts?: string[];
  sourceRegion?: SourceRegion | null;
  sourceChunks?: SourceChunk[];
  sourceChunkIds?: string[];
};

export function SourceImageDialog({
  onClose,
  pageNumber,
  source,
  fileId,
  previewUrl,
  previewMimeType,
  questionText,
  questionNumber,
  optionTexts,
  sourceRegion,
  sourceChunks,
  sourceChunkIds,
  questionId,
}: {
  onClose: () => void;
  pageNumber: number;
  source: PdfSource;
  fileId?: string;
  previewUrl?: string;
  previewMimeType?: string;
  imageUrl?: string;
  questionText?: string;
  questionNumber?: number;
  optionTexts?: string[];
  sourceRegion?: SourcePreview["sourceRegion"];
  sourceChunks?: SourceChunk[];
  sourceChunkIds?: string[];
  questionId?: string;
}) {
  const [debugMode, setDebugMode] = useState(isSourceDebugEnabled());
  const debugAvailable = isSourceDebugAvailable();
  const pageChunks = filterChunksForPage(sourceChunks ?? [], pageNumber);
  const selectedChunkId = findChunkForQuestion(pageChunks, {
    sourceChunkIds,
    sourceRegion,
    questionNumber,
  });
  const selectedChunk = selectedChunkId
    ? pageChunks.find((chunk) => chunk.id === selectedChunkId)
    : undefined;
  const effectiveSourceRegion =
    selectedChunk?.region ? normalizeSourceRegion(selectedChunk.region, pageNumber) : sourceRegion;

  const preview = {
    previewUrl: previewUrl ?? getSourcePreview(source).previewUrl,
    previewMimeType: previewMimeType ?? getSourcePreview(source).previewMimeType,
  };

  const isPdf = isPdfPreviewMime(preview.previewMimeType);
  const isImage = isImagePreviewMime(preview.previewMimeType);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Question source preview"
    >
      <div
        className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-neutral-950 shadow-2xl ring-1 ring-white/10"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4 text-white">
          <div>
            <div className="text-sm font-semibold">
              {questionNumber ? `Source for Question ${questionNumber}` : "Source page"}
            </div>
            <div className="text-xs text-white/60">Page {pageNumber}</div>
          </div>
          <div className="flex items-center gap-2">
            {debugAvailable ? (
              <button
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  debugMode
                    ? "bg-cyan-500 text-black"
                    : "bg-white/10 text-white/70 hover:bg-white/20"
                }`}
                onClick={() => setDebugMode(toggleSourceDebugEnabled())}
                type="button"
              >
                Debug regions
              </button>
            ) : null}
            <button
              className="grid size-9 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
              onClick={onClose}
              type="button"
              aria-label="Close source preview"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {isPdf ? (
            <QuestionSourceCanvas
              debugMode={debugMode}
              fileId={fileId}
              pageChunks={pageChunks}
              pageNumber={pageNumber}
              previewUrl={preview.previewUrl}
              questionId={questionId}
              questionNumber={questionNumber}
              optionTexts={optionTexts}
              questionText={questionText}
              selectedChunkId={selectedChunkId}
              source={source}
              sourceRegion={effectiveSourceRegion}
            />
          ) : isImage ? (
            <ImageSourceHighlighter
              imageUrl={preview.previewUrl}
              sourceRegion={effectiveSourceRegion}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <div className="rounded-2xl bg-white p-8 text-center shadow-2xl">
                <FileText className="mx-auto size-10 text-slate-400" aria-hidden />
                <p className="mt-3 text-sm font-bold text-slate-700">
                  Source preview is available for images and PDFs.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionSourceCanvas({
  pageNumber,
  source,
  fileId,
  previewUrl,
  questionText,
  questionNumber,
  optionTexts,
  sourceRegion,
  questionId,
  debugMode = false,
  pageChunks = [],
  selectedChunkId,
}: {
  pageNumber: number;
  source: PdfSource;
  fileId?: string;
  previewUrl: string;
  questionText?: string;
  questionNumber?: number;
  optionTexts?: string[];
  sourceRegion?: SourcePreview["sourceRegion"];
  questionId?: string;
  debugMode?: boolean;
  pageChunks?: SourceChunk[];
  selectedChunkId?: string;
}) {
  const pageWrapRef = useRef<HTMLDivElement>(null);
  const cacheSourceRef = useRef<PagePreviewLoadResult["cacheSource"]>("pdfjs");
  const [pageState, setPageState] = useState<SourcePageState>({ status: "loading" });
  const [highlight, setHighlight] = useState<NormalizedRegion | null>(null);
  const [highlightUnconfirmed, setHighlightUnconfirmed] = useState(false);

  const sourceRegionKey = useMemo(() => {
    if (!sourceRegion) return "";
    return [
      sourceRegion.pageNumber,
      sourceRegion.x,
      sourceRegion.y,
      sourceRegion.width,
      sourceRegion.height,
      sourceRegion.confidence ?? "",
      sourceRegion.method ?? "",
    ].join("|");
  }, [sourceRegion]);

  const sourceKey = useMemo(
    () => [previewUrl, source.name, source.url ?? "", source.dataUrl ?? ""].join("|"),
    [previewUrl, source.name, source.url, source.dataUrl],
  );

  const optionTextsKey = optionTexts?.join("\0") ?? "";

  const normalizedRegion = useMemo(
    () => normalizeSourceRegion(sourceRegion ?? null, pageNumber),
    // sourceRegionKey captures region value changes without object identity churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceRegionKey, pageNumber],
  );
  const hasHighlightTarget = Boolean(
    normalizedRegion ||
      questionText?.trim() ||
      questionNumber ||
      optionTexts?.some((option) => option.trim()),
  );

  const isConvertedPreview = useMemo(
    () =>
      Boolean(
        source.mimeType &&
          !source.mimeType.includes("pdf") &&
          !source.name.toLowerCase().endsWith(".pdf"),
      ),
    [source.mimeType, source.name],
  );

  function emitTelemetry(confirmed: boolean, renderMs: number, usedCache: boolean) {
    if (!fileId || !questionId) return;
    const payload: SourceViewTelemetry = {
      fileId,
      questionId,
      pageNumber,
      hasSourceRegion: Boolean(normalizedRegion),
      sourceKind: normalizedRegion?.sourceKind,
      method: normalizedRegion?.method,
      confidence: normalizedRegion?.confidence,
      usedCachedPagePreview: usedCache,
      cacheSource: cacheSourceRef.current,
      highlightConfirmed: confirmed,
      renderMs,
      debugMode,
    };
    logSourceViewEvent(payload);
  }

  function emitSourceAudit(
    eventType: "source_region_invalid" | "source_image_load_failed",
    reason: string,
    metadata?: Record<string, unknown>,
  ) {
    if (!questionId) return;
    void recordClientAuditEvent({
      eventType,
      feature: "source",
      fileHash: fileId,
      questionId,
      reason,
      metadata: {
        sourcePage: pageNumber,
        hasSourceRegion: Boolean(normalizedRegion),
        ...metadata,
      },
    });
  }

  useEffect(() => {
    let cancelled = false;
    const startedAt = performance.now();

    async function resolveHighlightFromPage(
      page: unknown | null,
      cssWidth: number,
      cssHeight: number,
      cacheSource: PagePreviewLoadResult["cacheSource"],
    ) {
      cacheSourceRef.current = cacheSource;
      const cssViewport = {
        width: cssWidth,
        height: cssHeight,
        scale: 1,
        transform: [1, 0, 0, 1, 0, 0],
      };

      const scale = 2;
      const pdfjs = await getPdfJs();

      let pageForLayout = page;
      if (!pageForLayout) {
        const previewSource: PdfSource = { ...source, url: previewUrl, previewUrl };
        const pdf = await openPdfDocument(previewSource, fileId);
        pageForLayout = await pdf.getPage(Math.min(Math.max(1, pageNumber), pdf.numPages));
      }

      const renderViewport = (
        pageForLayout as {
          getViewport: (args: { scale: number }) => {
            width: number;
            height: number;
            transform: number[];
            scale: number;
          };
        }
      ).getViewport({ scale });

      const resolved = await resolveFinalHighlightRegion({
        sourceRegion: normalizedRegion ?? undefined,
        page: pageForLayout,
        renderViewport,
        renderScale: scale,
        pdfjsUtil: pdfjs.Util,
        questionText,
        questionNumber,
        optionTexts,
        isConvertedPreview,
        minConfidence: MIN_HIGHLIGHT_CONFIDENCE,
      });

      if (cancelled) return;

      if (resolved) {
        setHighlight(resolved.normalized);
        setHighlightUnconfirmed(false);
        emitTelemetry(true, performance.now() - startedAt, cacheSource !== "pdfjs");
        requestAnimationFrame(() => {
          pageWrapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        return;
      }

      if (
        normalizedRegion &&
        isValidHighlightRegion(
          {
            x: normalizedRegion.x * cssWidth,
            y: normalizedRegion.y * cssHeight,
            width: normalizedRegion.width * cssWidth,
            height: normalizedRegion.height * cssHeight,
          },
          cssViewport,
        )
      ) {
        setHighlight({
          x: normalizedRegion.x,
          y: normalizedRegion.y,
          width: normalizedRegion.width,
          height: normalizedRegion.height,
        });
        setHighlightUnconfirmed(false);
        emitTelemetry(true, performance.now() - startedAt, cacheSource !== "pdfjs");
        return;
      }

      setHighlight(null);
      setHighlightUnconfirmed(true);
      emitTelemetry(false, performance.now() - startedAt, cacheSource !== "pdfjs");
    }

    async function loadSourcePage() {
      setPageState({ status: "loading" });
      setHighlight(null);
      setHighlightUnconfirmed(false);

      try {
        const loaded = await loadQuestionSourcePage({
          fileId,
          pageNumber,
          source,
          previewUrl,
        });

        if (cancelled) return;

        setPageState({
          status: "ready",
          imageUrl: loaded.imageUrl,
          width: loaded.width,
          height: loaded.height,
          cacheSource: loaded.cacheSource,
        });

        if (!hasHighlightTarget) {
          setHighlight(null);
          setHighlightUnconfirmed(false);
          return;
        }

        await resolveHighlightFromPage(null, loaded.width, loaded.height, loaded.cacheSource);
      } catch (renderError) {
        if (!cancelled) {
          setPageState({
            status: "error",
            reason: formatSourceLoadError(renderError),
          });
          emitTelemetry(false, performance.now() - startedAt, false);
        }
      }
    }

    void loadSourcePage();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- telemetry helper reads latest cacheSourceRef
  }, [
    fileId,
    hasHighlightTarget,
    isConvertedPreview,
    normalizedRegion,
    optionTextsKey,
    pageNumber,
    previewUrl,
    questionId,
    questionNumber,
    questionText,
    sourceKey,
    sourceRegionKey,
  ]);

  if (pageState.status === "error") {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
          <p className="text-sm font-semibold text-red-600">{pageState.reason}</p>
          <Link
            className="mt-4 inline-flex h-10 items-center rounded-full bg-zinc-950 px-5 text-sm font-bold text-white"
            href="/"
          >
            Re-upload file
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center overflow-auto p-4 sm:p-6">
      {pageState.status === "loading" ? (
        <div className="flex h-64 w-full max-w-3xl items-center justify-center rounded-2xl bg-white/10 text-sm font-semibold text-white/70">
          Loading source page…
        </div>
      ) : null}

      {pageState.status === "ready" ? (
        <>
          {debugMode ? <SourceDebugLegend chunkCount={pageChunks.length} /> : null}
          {!debugMode && highlightUnconfirmed ? <SourceUnconfirmedBanner /> : null}
          <div ref={pageWrapRef} className="mx-auto w-full max-w-4xl">
            <CachedPageImage
              imageUrl={pageState.imageUrl}
              onImageError={() => {
                emitSourceAudit("source_image_load_failed", "image_load_error", {
                  hasImageUrl: Boolean(pageState.imageUrl),
                  imageWidth: pageState.width,
                  imageHeight: pageState.height,
                });
                setPageState({
                  status: "error",
                  reason: "Source image failed to load.",
                });
              }}
              pageSize={{ width: pageState.width, height: pageState.height }}
            >
              {debugMode ? (
                <SourceDebugOverlay chunks={pageChunks} selectedChunkId={selectedChunkId} />
              ) : highlight ? (
                <SourceHighlightOverlay region={highlight} />
              ) : null}
            </CachedPageImage>
          </div>
        </>
      ) : null}
    </div>
  );
}

function formatSourceLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("source_not_ready:")) {
    const reason = message.slice("source_not_ready:".length);
    if (reason === "source_page_preview_missing") return "Source is still processing.";
    if (reason === "source_region_invalid") return "Source page is available, but the highlight is unavailable.";
    return "Source unavailable for this question.";
  }
  if (message.startsWith("question_source_failed_")) {
    return "Source unavailable right now.";
  }
  return message || "Could not render the source page.";
}

function CachedPageImage({
  imageUrl,
  pageSize,
  children,
  onImageError,
}: {
  imageUrl: string;
  pageSize?: { width: number; height: number };
  children?: ReactNode;
  onImageError?: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    const wrap = wrapRef.current;
    if (!img || !wrap) return;

    function syncWrapSize() {
      const rect = img!.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      wrap!.style.width = `${rect.width}px`;
      wrap!.style.height = `${rect.height}px`;
    }

    syncWrapSize();
    const observer = new ResizeObserver(syncWrapSize);
    observer.observe(img);

    return () => observer.disconnect();
  }, [imageUrl, pageSize?.height, pageSize?.width]);

  return (
    <div ref={wrapRef} className="relative mx-auto w-full bg-white shadow-2xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        alt="Source page"
        className="block h-auto w-full max-h-[calc(88vh-7rem)] object-contain"
        height={pageSize?.height}
        onError={onImageError}
        src={imageUrl}
        width={pageSize?.width}
      />
      {children}
    </div>
  );
}

function SourceUnconfirmedBanner() {
  return (
    <p className="mb-3 rounded-full bg-white/10 px-4 py-2 text-center text-xs font-medium text-white/70">
      Exact source area could not be confirmed.
    </p>
  );
}

function ImageSourceHighlighter({
  imageUrl,
  sourceRegion,
}: {
  imageUrl: string;
  sourceRegion?: SourcePreview["sourceRegion"];
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState<NormalizedRegion | null>(null);
  const [highlightUnconfirmed, setHighlightUnconfirmed] = useState(false);

  const normalizedRegion = normalizeSourceRegion(sourceRegion ?? null, 1);

  const updateHighlight = useCallback(() => {
    const img = imgRef.current;
    const wrap = wrapRef.current;
    if (!img || !wrap) return;

    const rect = img.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    wrap.style.width = `${rect.width}px`;
    wrap.style.height = `${rect.height}px`;

    if (!normalizedRegion) {
      setHighlight(null);
      setHighlightUnconfirmed(false);
      return;
    }

    const cssViewport = {
      width: rect.width,
      height: rect.height,
      scale: 1,
      transform: [1, 0, 0, 1, 0, 0],
    };

    const pixelRegion = {
      x: normalizedRegion.x * rect.width,
      y: normalizedRegion.y * rect.height,
      width: normalizedRegion.width * rect.width,
      height: normalizedRegion.height * rect.height,
    };

    if (isValidHighlightRegion(pixelRegion, cssViewport)) {
      setHighlight({
        x: normalizedRegion.x,
        y: normalizedRegion.y,
        width: normalizedRegion.width,
        height: normalizedRegion.height,
      });
      setHighlightUnconfirmed(false);
    } else {
      setHighlight(null);
      setHighlightUnconfirmed(true);
    }
  }, [normalizedRegion]);

  useEffect(() => {
    const img = imgRef.current;
    const wrap = wrapRef.current;
    if (!img) return;

    const observer = new ResizeObserver(updateHighlight);
    observer.observe(img);
    if (wrap) observer.observe(wrap);

    return () => observer.disconnect();
  }, [imageUrl, updateHighlight]);

  return (
    <div className="flex h-full w-full flex-col items-center overflow-auto p-6">
      {highlightUnconfirmed ? <SourceUnconfirmedBanner /> : null}
      <div ref={wrapRef} className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          alt="Question source"
          className="block max-h-[calc(88vh-7rem)] max-w-full object-contain"
          onLoad={updateHighlight}
          src={imageUrl}
        />
        {highlight ? <SourceHighlightOverlay region={highlight} /> : null}
      </div>
    </div>
  );
}

export function SourceHighlightOverlay({ region }: { region: NormalizedRegion }) {
  const { x, y, width, height } = region;
  const pct = (value: number) => `${value * 100}%`;

  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-x-0 top-0 bg-black/50" style={{ height: pct(y) }} />
      <div
        className="absolute inset-x-0 bg-black/50"
        style={{ top: pct(y + height), bottom: 0 }}
      />
      <div
        className="absolute bg-black/50"
        style={{ left: 0, top: pct(y), width: pct(x), height: pct(height) }}
      />
      <div
        className="absolute bg-black/50"
        style={{ left: pct(x + width), top: pct(y), right: 0, height: pct(height) }}
      />
      <div
        className="absolute rounded-md ring-4 ring-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.9)]"
        style={{
          left: pct(x),
          top: pct(y),
          width: pct(width),
          height: pct(height),
        }}
      />
    </div>
  );
}

export function ExplainSideChat({
  onClose,
  question,
  chatHistory,
  onAddMessage,
}: {
  onClose: () => void;
  question: PdfMcq;
  chatHistory: ChatMessage[];
  onAddMessage: (msg: ChatMessage) => void;
}) {
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingReply, setStreamingReply] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, streamingReply, isLoading]);

  function handleSend() {
    const text = draft.trim();
    if (!text || isLoading) return;

    const nextMessages: ChatMessage[] = [...chatHistory, { role: "user", text }];
    onAddMessage({ role: "user", text });
    setDraft("");
    setStreamingReply("");
    setIsLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    void streamTutorReply({
      system: buildQuizAssistantInstructions(question),
      messages: nextMessages,
      signal: controller.signal,
      onUpdate: setStreamingReply,
    })
      .then((final) => {
        onAddMessage({ role: "assistant", text: final });
        setStreamingReply("");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error
            ? error.message
            : "Could not reach the AI tutor. Try again.";
        onAddMessage({ role: "assistant", text: message });
        setStreamingReply("");
      })
      .finally(() => {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setIsLoading(false);
      });
  }

  const questionLabel = `Q${question.questionNumber ?? ""}`;

  return (
    <>
      <div className="fixed inset-0 z-[88]" onClick={onClose} aria-hidden />

      <div
        className="fixed bottom-6 right-5 z-[90] flex h-[520px] w-[360px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60 sm:w-[400px]"
        style={{ animation: "slideUp 0.25s cubic-bezier(0.4,0,0.2,1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between bg-zinc-950 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-full bg-white/10 text-xs font-black text-white">
              {questionLabel}
            </span>
            <p className="text-sm font-bold text-white">Explanation</p>
          </div>
          <button
            className="grid size-8 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <p className="line-clamp-2 text-xs font-semibold leading-5 text-slate-500">
            {getQuestionText(question)}
          </p>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-3">
            {chatHistory.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" ? (
                  <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-800">
                    {msg.text.split("\n").map((line, j) => (
                      <p key={j} className={j > 0 ? "mt-1" : ""}>
                        {line}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-zinc-950 px-4 py-3 text-sm leading-6 text-white">
                    {msg.text}
                  </div>
                )}
              </div>
            ))}
            {streamingReply || (isLoading && !streamingReply) ? (
              <div className="flex justify-start">
                <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-800">
                  {streamingReply || "Thinking…"}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-100 px-3 py-3">
          <div className="flex gap-2">
            <input
              autoFocus
              className="h-10 min-w-0 flex-1 rounded-xl bg-slate-100 px-3.5 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:bg-slate-50 focus:ring-2 focus:ring-zinc-950/10"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about this question…"
              value={draft}
              type="text"
            />
            <button
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-zinc-950 text-white transition hover:bg-zinc-800 disabled:opacity-40"
              disabled={!draft.trim() || isLoading}
              onClick={handleSend}
              type="button"
            >
              <Send className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
