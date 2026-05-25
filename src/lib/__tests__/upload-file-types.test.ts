import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getUnsupportedUploadReason,
  filterSupportedUploadFiles,
  inferUploadMimeType,
  isSupportedUploadFile,
  UPLOAD_ACCEPT_ATTRIBUTE,
} from "../upload-file-types.ts";

describe("upload file types", () => {
  it("accepts extraction-ready file types", () => {
    const file = new File(["%PDF"], "notes.pdf", { type: "" });
    assert.equal(isSupportedUploadFile(file), true);
    assert.equal(filterSupportedUploadFiles([file]).length, 1);
    assert.match(UPLOAD_ACCEPT_ATTRIBUTE, /application\/pdf/);
  });

  it("clearly rejects docx and pptx files", () => {
    const docx = new File(["hello"], "notes.docx", { type: "" });
    const pptx = new File(["hello"], "slides.pptx", { type: "" });

    assert.equal(isSupportedUploadFile(docx), false);
    assert.equal(isSupportedUploadFile(pptx), false);
    assert.match(getUnsupportedUploadReason(docx) ?? "", /Export the file to PDF/);
    assert.equal(filterSupportedUploadFiles([docx, pptx]).length, 0);
  });

  it("infers mime types from extensions when file.type is empty", () => {
    const file = new File(["%PDF"], "exam.pdf", { type: "" });
    assert.equal(inferUploadMimeType(file), "application/pdf");
  });
});
