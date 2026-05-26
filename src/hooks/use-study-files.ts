"use client";

import { api } from "../../convex/_generated/api";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";
import { loadFiles } from "@/lib/pdf-view-storage";
import {
  mergeConvexRecordsWithLocal,
  type ConvexExtractionRecord,
} from "@/lib/study-files";
import { syncMissingSourceFilesFromConvex } from "@/lib/resolve-source-file";
import { convex } from "@/lib/convex-client";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";

export function useStudyFiles(): {
  files: PdfFileQueueItem[] | undefined;
  isLoading: boolean;
} {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const records = useQuery(api.studyFiles.listMyExtractions);
  const [localFiles, setLocalFiles] = useState<PdfFileQueueItem[]>([]);

  useEffect(() => {
    setLocalFiles(loadFiles());
  }, []);

  const files = useMemo(() => {
    if (records === undefined) return undefined;
    return mergeConvexRecordsWithLocal(
      records as ConvexExtractionRecord[],
      localFiles,
    );
  }, [localFiles, records]);

  const syncedFileIdsRef = useRef<string>("");
  useEffect(() => {
    if (!files?.length || !isAuthenticated || authLoading) return;
    const key = files.map((file) => file.id).join(",");
    if (syncedFileIdsRef.current === key) return;
    syncedFileIdsRef.current = key;
    void syncMissingSourceFilesFromConvex(
      files.map((file) => file.id),
      { convex },
    );
  }, [authLoading, files, isAuthenticated]);

  return {
    files,
    isLoading: records === undefined,
  };
}

export function useStudyFile(fileId: string): {
  file: PdfFileQueueItem | undefined;
  isLoading: boolean;
} {
  const { files, isLoading } = useStudyFiles();

  const file = useMemo(
    () => files?.find((item) => item.id === fileId),
    [fileId, files],
  );

  return { file, isLoading };
}
