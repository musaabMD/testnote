import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import {
  fetchServerSourcePagePreview,
  isServerPagePreviewEnabled,
  loadQuestionSourcePage,
  loadSourcePagePreview,
  resetSourcePageLoadGuards,
} from "../source-page-loader.ts";

const originalFetch = globalThis.fetch;
const originalEnv = process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW;

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  globalThis.fetch = mock.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url);
  }) as typeof fetch;
}

describe("isServerPagePreviewEnabled", () => {
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW;
    } else {
      process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW = originalEnv;
    }
  });

  it("is true by default", () => {
    delete process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW;
    assert.equal(isServerPagePreviewEnabled(), true);
  });

  it("is false only when env is explicitly false", () => {
    process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW = "false";
    assert.equal(isServerPagePreviewEnabled(), false);
    process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW = "true";
    assert.equal(isServerPagePreviewEnabled(), true);
  });
});

describe("fetchServerSourcePagePreview", () => {
  beforeEach(() => {
    resetSourcePageLoadGuards();
    process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW = "true";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetSourcePageLoadGuards();
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW;
    } else {
      process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW = originalEnv;
    }
  });

  it("returns null on 404 without throwing", async () => {
    mockFetch(() => new Response(null, { status: 404 }));

    const result = await fetchServerSourcePagePreview("file-1", 2);
    assert.equal(result, null);
  });

  it("does not call server when kill switch is false", async () => {
    process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW = "false";
    let called = false;
    mockFetch(() => {
      called = true;
      return new Response(null, { status: 404 });
    });

    const result = await fetchServerSourcePagePreview("file-1", 2);
    assert.equal(result, null);
    assert.equal(called, false);
  });

  it("throws for non-404 server failures", async () => {
    mockFetch(() => new Response(null, { status: 500 }));

    await assert.rejects(
      () => fetchServerSourcePagePreview("file-1", 2),
      /page_preview_failed_500/,
    );
  });
});

describe("loadSourcePagePreview in-flight guard", () => {
  beforeEach(() => {
    resetSourcePageLoadGuards();
    process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW = "true";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetSourcePageLoadGuards();
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW;
    } else {
      process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW = originalEnv;
    }
  });

  it("dedupes concurrent loads for the same fileId and pageNumber", async () => {
    let fetchCount = 0;
    mockFetch((url) => {
      if (url.includes("/api/pdf/page-preview")) {
        fetchCount += 1;
      }
      return new Response(null, { status: 404 });
    });

    const [first, second] = await Promise.all([
      loadSourcePagePreview("file-1", 3),
      loadSourcePagePreview("file-1", 3),
    ]);

    assert.equal(first, null);
    assert.equal(second, null);
    assert.equal(fetchCount, 1);
  });
});

describe("loadQuestionSourcePage fallback", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetSourcePageLoadGuards();
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW;
    } else {
      process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW = originalEnv;
    }
  });

  it("skips server fetch when kill switch is false and renders with PDF.js", async () => {
    process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW = "false";
    let fetchCount = 0;
    mockFetch(() => {
      fetchCount += 1;
      return new Response(null, { status: 404 });
    });

    const rendered = {
      imageUrl: "data:image/jpeg;base64,abc",
      width: 612,
      height: 792,
      cacheSource: "pdfjs" as const,
    };

    const result = await loadQuestionSourcePage({
      fileId: "file-1",
      pageNumber: 2,
      source: { name: "sample.pdf", url: "blob:sample" },
      previewUrl: "blob:sample",
      renderPage: async () => rendered,
    });

    assert.deepEqual(result, rendered);
    assert.equal(fetchCount, 0);
  });

  it("uses cached server preview before PDF.js rendering", async () => {
    process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW = "true";
    let fetchCount = 0;
    let renderCount = 0;
    mockFetch((url) => {
      if (url.includes("/api/pdf/page-preview")) {
        fetchCount += 1;
        return Response.json({
          imageUrl: "data:image/webp;base64,server",
          width: 612,
          height: 792,
        });
      }
      return new Response(null, { status: 404 });
    });

    const result = await loadQuestionSourcePage({
      fileId: "file-1",
      pageNumber: 2,
      source: { name: "sample.pdf", url: "blob:sample" },
      previewUrl: "blob:sample",
      renderPage: async () => {
        renderCount += 1;
        throw new Error("PDF.js should not render when server preview exists");
      },
    });

    assert.deepEqual(result, {
      imageUrl: "data:image/webp;base64,server",
      width: 612,
      height: 792,
      cacheSource: "server",
    });
    assert.equal(fetchCount, 1);
    assert.equal(renderCount, 0);
  });

  it("falls back to PDF.js when no cached preview exists", async () => {
    process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW = "true";
    let fetchCount = 0;
    mockFetch((url) => {
      if (url.includes("/api/pdf/page-preview")) {
        fetchCount += 1;
        return new Response(null, { status: 404 });
      }
      return new Response(null, { status: 404 });
    });

    const rendered = {
      imageUrl: "data:image/jpeg;base64,fallback",
      width: 612,
      height: 792,
      cacheSource: "pdfjs" as const,
    };

    const result = await loadQuestionSourcePage({
      fileId: "file-1",
      pageNumber: 2,
      source: { name: "sample.pdf", url: "blob:sample" },
      previewUrl: "blob:sample",
      renderPage: async () => rendered,
    });

    assert.deepEqual(result, rendered);
    assert.equal(fetchCount, 1);
  });

  it("falls back to PDF.js when the server preview request fails", async () => {
    process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW = "true";
    mockFetch((url) => {
      if (url.includes("/api/pdf/page-preview")) {
        return new Response(null, { status: 500 });
      }
      return new Response(null, { status: 404 });
    });

    const rendered = {
      imageUrl: "data:image/jpeg;base64,fallback",
      width: 612,
      height: 792,
      cacheSource: "pdfjs" as const,
    };

    const result = await loadQuestionSourcePage({
      fileId: "file-1",
      pageNumber: 2,
      source: { name: "sample.pdf", url: "blob:sample" },
      previewUrl: "blob:sample",
      renderPage: async () => rendered,
    });

    assert.deepEqual(result, rendered);
  });

  it("ignores question API payloads and renders the real PDF page", async () => {
    process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW = "true";
    const calls: string[] = [];
    mockFetch((url) => {
      calls.push(url);
      return new Response(null, { status: 404 });
    });

    const rendered = {
      imageUrl: "data:image/jpeg;base64,pdfjs",
      width: 612,
      height: 792,
      cacheSource: "pdfjs" as const,
    };

    const result = await loadQuestionSourcePage({
      questionId: "q_1",
      fileId: "file-1",
      pageNumber: 2,
      source: { name: "sample.pdf", url: "blob:sample" },
      previewUrl: "blob:sample",
      renderPage: async () => rendered,
    });

    assert.deepEqual(result, rendered);
    assert.equal(calls.some((url) => url.includes("/api/questions/")), false);
  });

  it("falls back to PDF.js when fileId is provided without question preview", async () => {
    mockFetch(() => new Response(null, { status: 404 }));

    const rendered = {
      imageUrl: "data:image/jpeg;base64,fallback",
      width: 612,
      height: 792,
      cacheSource: "pdfjs" as const,
    };

    const result = await loadQuestionSourcePage({
      questionId: "q_missing",
      fileId: "file-1",
      pageNumber: 2,
      source: { name: "sample.pdf", url: "blob:sample" },
      previewUrl: "blob:sample",
      renderPage: async () => rendered,
    });

    assert.deepEqual(result, rendered);
  });
});

describe("SourcePageState expectations", () => {
  it("documents explicit terminal states", () => {
    const loading = { status: "loading" as const };
    const ready = {
      status: "ready" as const,
      imageUrl: "data:image/jpeg;base64,abc",
      width: 100,
      height: 200,
      cacheSource: "pdfjs" as const,
    };
    const error = { status: "error" as const, reason: "Could not render the source page." };

    assert.equal(loading.status, "loading");
    assert.equal(ready.status, "ready");
    assert.equal(error.status, "error");
  });
});
