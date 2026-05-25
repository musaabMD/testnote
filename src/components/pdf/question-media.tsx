"use client";

import {
  resolveQuestionImageUrl,
  shouldShowQuestionImage,
} from "@/lib/pdf-question-images";
import type { PdfFileQueueItem, PdfMcq } from "@/lib/pdf-mcqs";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

function questionCacheKey(file: PdfFileQueueItem, question: PdfMcq, index: number) {
  const text = question.questionText ?? question.question ?? "";
  return `${file.id}-${question.questionNumber ?? index + 1}-${text.slice(0, 32)}`;
}

type QuestionMediaProps = {
  file: PdfFileQueueItem;
  question: PdfMcq;
  questionIndex: number;
  className?: string;
  onImageClick?: (imageUrl: string) => void;
};

export function QuestionMedia({
  file,
  question,
  questionIndex,
  className = "",
  onImageClick,
}: QuestionMediaProps) {
  const existingImageUrl = question.imageUrls?.find(Boolean) ?? null;
  const cacheKey = useMemo(
    () => questionCacheKey(file, question, questionIndex),
    [file, question, questionIndex],
  );
  const [resolvedImage, setResolvedImage] = useState<{
    cacheKey: string;
    url: string | null;
  } | null>(null);
  const resolvedImageUrl =
    resolvedImage?.cacheKey === cacheKey ? resolvedImage.url : null;
  const imageUrl = existingImageUrl ?? resolvedImageUrl;
  const shouldResolveImage =
    !existingImageUrl && shouldShowQuestionImage(question);
  const loading = shouldResolveImage && resolvedImage?.cacheKey !== cacheKey;

  useEffect(() => {
    if (!shouldResolveImage) {
      return;
    }

    let cancelled = false;

    void resolveQuestionImageUrl(cacheKey, file.source, question).then((url) => {
      if (cancelled) return;
      setResolvedImage({ cacheKey, url });
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, file.source, question, shouldResolveImage]);

  if (loading) {
    return (
      <div
        className={`mt-4 h-40 animate-pulse rounded-2xl bg-slate-100 ${className}`}
        aria-hidden
      />
    );
  }

  if (!imageUrl) return null;

  const image = (
    <Image
      alt="Question figure"
      className="mx-auto h-auto max-h-80 w-auto max-w-full rounded-2xl object-contain"
      height={640}
      src={imageUrl}
      unoptimized
      width={640}
    />
  );

  return (
    <div className={`mt-4 ${className}`}>
      {onImageClick ? (
        <button
          className="block w-full rounded-2xl bg-slate-50 p-2 transition hover:bg-slate-100"
          onClick={() => onImageClick(imageUrl)}
          type="button"
        >
          {image}
        </button>
      ) : (
        <div className="rounded-2xl bg-slate-50 p-2">{image}</div>
      )}
    </div>
  );
}

export function QuestionMediaThumbnail({
  file,
  question,
  questionIndex,
}: {
  file: PdfFileQueueItem;
  question: PdfMcq;
  questionIndex: number;
}) {
  const existingImageUrl = question.imageUrls?.find(Boolean) ?? null;
  const cacheKey = useMemo(
    () => `${questionCacheKey(file, question, questionIndex)}-thumb`,
    [file, question, questionIndex],
  );
  const [resolvedImage, setResolvedImage] = useState<{
    cacheKey: string;
    url: string | null;
  } | null>(null);
  const imageUrl =
    existingImageUrl ??
    (resolvedImage?.cacheKey === cacheKey ? resolvedImage.url : null);
  const shouldResolveImage =
    !existingImageUrl && shouldShowQuestionImage(question);

  useEffect(() => {
    if (!shouldResolveImage) return;

    let cancelled = false;

    void resolveQuestionImageUrl(cacheKey, file.source, question).then((url) => {
      if (!cancelled) setResolvedImage({ cacheKey, url });
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, file.source, question, shouldResolveImage]);

  if (!imageUrl) return null;

  return (
    <Image
      alt=""
      aria-hidden
      className="mt-2 h-14 w-auto max-w-[120px] rounded-lg object-cover"
      height={56}
      src={imageUrl}
      unoptimized
      width={120}
    />
  );
}
