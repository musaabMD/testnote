"use client";

import { api } from "../../convex/_generated/api";
import type { Exam } from "@/lib/exams";
import {
  examCategoriesFrom,
  examsWithFiles,
} from "@/lib/exams";
import { useQuery } from "convex/react";
import { useMemo } from "react";

export function useExamCatalog(options?: {
  countryName?: string;
  withFilesOnly?: boolean;
}): {
  exams: Exam[] | undefined;
  examsWithFiles: Exam[] | undefined;
  categories: string[];
  isLoading: boolean;
} {
  const records = useQuery(api.exams.listCatalog, {
    countryName: options?.countryName,
    withFilesOnly: options?.withFilesOnly,
  });

  const exams = useMemo(
    () => (records === undefined ? undefined : (records as Exam[])),
    [records],
  );

  const availableExams = useMemo(
    () => (exams ? examsWithFiles(exams) : undefined),
    [exams],
  );

  const categories = useMemo(
    () => (availableExams ? examCategoriesFrom(availableExams) : []),
    [availableExams],
  );

  return {
    exams,
    examsWithFiles: availableExams,
    categories,
    isLoading: records === undefined,
  };
}

export function useExamBySlug(slug: string): {
  exam: Exam | undefined | null;
  isLoading: boolean;
} {
  const record = useQuery(api.exams.getBySlug, slug ? { slug } : "skip");

  return {
    exam: record === undefined ? undefined : (record as Exam | null),
    isLoading: record === undefined,
  };
}
