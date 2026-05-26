"use client";

import { api } from "../../convex/_generated/api";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";
import {
  loadFiles,
  PDF_FILE_QUEUE_UPDATED_EVENT,
} from "@/lib/pdf-view-storage";
import {
  mergeConvexRecordsWithLocal,
  type ConvexExtractionRecord,
} from "@/lib/study-files";
import { syncMissingSourceFilesFromConvex } from "@/lib/resolve-source-file";
import { convex } from "@/lib/convex-client";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";

const CONVEX_AUTH_TIMEOUT_MS = 8000;

export function useStudyFiles(): {
  files: PdfFileQueueItem[] | undefined;
  isLoading: boolean;
} {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const [localFiles, setLocalFiles] = useState<PdfFileQueueItem[]>(loadFiles);
  const [authWaitExpired, setAuthWaitExpired] = useState(false);
  const convexAuthTimedOut = authLoading && authWaitExpired;
  const queryDisabled = convexAuthTimedOut || (!authLoading && !isAuthenticated);
  const records = useQuery(
    api.studyFiles.listMyExtractions,
    queryDisabled ? "skip" : {},
  );

  useEffect(() => {
    if (!authLoading) return;
    const timeout = window.setTimeout(() => {
      setAuthWaitExpired(true);
    }, CONVEX_AUTH_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [authLoading]);

  useEffect(() => {
    function handleFileQueueUpdated() {
      setLocalFiles(loadFiles());
    }
    window.addEventListener(PDF_FILE_QUEUE_UPDATED_EVENT, handleFileQueueUpdated);
    return () => {
      window.removeEventListener(
        PDF_FILE_QUEUE_UPDATED_EVENT,
        handleFileQueueUpdated,
      );
    };
  }, []);

  const files = useMemo(() => {
    if (queryDisabled) return localFiles;
    if (records === undefined) return undefined;
    return mergeConvexRecordsWithLocal(
      records as ConvexExtractionRecord[],
      localFiles,
    );
  }, [localFiles, queryDisabled, records]);

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
    isLoading: files === undefined,
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
