export type UploadPipelineLogData = Record<
  string,
  string | number | boolean | null | undefined
>;

export function logUploadPipeline(
  uploadTraceId: string | undefined,
  stage: string,
  data: UploadPipelineLogData = {},
) {
  console.log(
    JSON.stringify({
      type: "upload_pipeline",
      uploadTraceId: uploadTraceId || "missing",
      stage,
      time: new Date().toISOString(),
      ...data,
    }),
  );
}
