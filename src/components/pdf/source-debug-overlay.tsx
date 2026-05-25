"use client";

import type { SourceChunk } from "@/lib/highlightable-source";
import { previewChunkText } from "@/lib/source-debug";
import type { NormalizedRegion } from "@/lib/pdf-source-region";

export function SourceDebugOverlay({
  chunks,
  selectedChunkId,
}: {
  chunks: SourceChunk[];
  selectedChunkId?: string;
}) {
  if (!chunks.length) {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-start justify-center p-4">
        <p className="rounded-md bg-black/70 px-3 py-2 text-xs font-medium text-cyan-200">
          No question blocks detected on this page.
        </p>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0">
      {chunks.map((chunk) => {
        const region = chunk.region;
        const pct = (value: number) => `${value * 100}%`;
        const isSelected = chunk.id === selectedChunkId;

        return (
          <div
            key={chunk.id}
            className={`absolute border-2 ${
              isSelected ? "border-amber-300 bg-amber-300/10" : "border-cyan-400 bg-cyan-400/10"
            }`}
            style={{
              left: pct(region.x),
              top: pct(region.y),
              width: pct(region.width),
              height: pct(region.height),
            }}
          >
            <div
              className={`absolute left-0 top-0 max-w-[min(100%,16rem)] -translate-y-full px-1.5 py-1 text-[10px] leading-tight ${
                isSelected ? "bg-amber-500 text-black" : "bg-cyan-500 text-black"
              }`}
            >
              <div className="font-bold">{chunk.id}</div>
              <div>p.{chunk.pageNumber}</div>
              <div>{region.sourceKind ?? "question-block"}</div>
              <div>{region.method ?? "pdf-layout"}</div>
              <div>conf {region.confidence?.toFixed(2) ?? "—"}</div>
              <div className="opacity-90">{previewChunkText(chunk.text)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SourceDebugLegend({ chunkCount }: { chunkCount: number }) {
  return (
    <p className="mb-3 rounded-full bg-cyan-500/20 px-4 py-2 text-center text-xs font-medium text-cyan-200">
      Debug mode: showing {chunkCount} detected question block{chunkCount === 1 ? "" : "s"} on
      this page
    </p>
  );
}

export function regionFromChunk(chunk: SourceChunk): NormalizedRegion {
  return {
    x: chunk.region.x,
    y: chunk.region.y,
    width: chunk.region.width,
    height: chunk.region.height,
  };
}
