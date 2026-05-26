import { requireClerkFeature } from "@/lib/clerk-access.server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit.server";
import { releaseQuotaReservation } from "@/lib/convex-usage-client.server";
import { isPdfOcrRouteEnabled } from "@/lib/extraction-config";
import {
  getOpenRouterMaxTokens,
  getOpenRouterModel,
} from "@/lib/openrouter-client";
import {
  estimateOcrCostUsd,
  reserveCostUsd,
} from "@/lib/plan-limits.server";
import { getQuotaSubject } from "@/lib/request-user.server";
import {
  preflightTrackedAiCall,
  trackedOpenRouterFetch,
} from "@/lib/tracked-openrouter.server";

type OcrRequest = {
  bbox?: [number, number, number, number];
  fileName?: string;
  pdfDataUrl?: string;
};

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isPdfOcrRouteEnabled()) {
    return Response.json(
      {
        error:
          "PDF OCR is disabled. Set ENABLE_PDF_OCR_ROUTE=true for manual/dev use only.",
      },
      { status: 403 },
    );
  }

  const rateLimited = await enforceApiRateLimit(request, "ocr");
  if (rateLimited) return rateLimited;

  const featureCheck = await requireClerkFeature("advancedStudy");
  if (featureCheck instanceof Response) return featureCheck;

  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as OcrRequest | null;

  if (!body?.pdfDataUrl?.startsWith("data:application/pdf;base64,")) {
    return Response.json({ error: "PDF data is required for OCR." }, { status: 400 });
  }

  const bbox = normalizeBbox(body.bbox);
  const clerkUserId = await getQuotaSubject(request);
  const model = getOpenRouterModel("OPENROUTER_OCR_MODEL");

  const preflight = await preflightTrackedAiCall({
    clerkUserId,
    feature: "ocr",
    estimatedCostUsd: reserveCostUsd(estimateOcrCostUsd()),
    model,
  });

  if (!preflight.allowed) {
    return Response.json(
      { error: preflight.reason ?? "Usage quota exceeded." },
      { status: 402 },
    );
  }

  const tracking = {
    clerkUserId,
    feature: "ocr" as const,
    reservationId: preflight.reservationId,
  };

  try {
    const { response, data } = await trackedOpenRouterFetch(tracking, model, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000/dashboard",
        "X-Title": "TestNote PDF OCR Selection",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: getOpenRouterMaxTokens("OPENROUTER_OCR_MAX_TOKENS", 2500),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are an AI assistant for educational PDF documents. Return only valid JSON. Do not include markdown fences around the JSON.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildPrompt(bbox),
              },
              {
                type: "file",
                file: {
                  filename: body.fileName ?? "document.pdf",
                  file_data: body.pdfDataUrl,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = data as { error?: { message?: string } } | null;
      return Response.json(
        { error: err?.error?.message ?? "OpenRouter OCR request failed." },
        { status: response.status },
      );
    }

    const content = (data as {
      choices?: Array<{ message?: { content?: string } }>;
    } | null)?.choices?.[0]?.message?.content;

    if (!content) {
      return Response.json(
        { error: "OpenRouter returned an empty OCR response." },
        { status: 502 },
      );
    }


    if (preflight.reservationId) {
      await releaseQuotaReservation(preflight.reservationId);
    }

    const parsed = parseJson(content);
    return Response.json(parsed);
  } catch (error) {
    if (preflight.reservationId) {
      await releaseQuotaReservation(preflight.reservationId);
    }
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "OpenRouter OCR request failed.",
      },
      { status: 502 },
    );
  }
}

function normalizeBbox(bbox: OcrRequest["bbox"]) {
  if (!bbox || bbox.length !== 4 || bbox.some((value) => typeof value !== "number")) {
    return null;
  }

  return bbox;
}

function buildPrompt(bbox: [number, number, number, number] | null) {
  return `You are an AI assistant for educational PDF documents.

The user may highlight text, diagrams, tables, formulas, or paragraphs inside a PDF page.

Your job is to:
1. Detect the selected content from the PDF.
2. Understand the educational meaning and structure.
3. Extract clean text and layout information.
4. Generate structured Markdown for the right-side panel.
5. Return bounding boxes so the frontend can highlight:
   - the original PDF region
   - the related output block on the right

The content may include:
- headings
- explanations
- definitions
- formulas
- equations
- diagrams
- tables
- quiz questions
- code snippets
- bullet points
- examples
- notes
- references

Input:
- PDF document
- Optional selected region bounding box:
  ${bbox ? `[${bbox.join(", ")}]` : "none"}

Return ONLY valid JSON in this format:

{
  "document_type": "educational_material",
  "selected_region": {
    "bbox": [x, y, width, height],
    "content_type": "heading | paragraph | formula | table | diagram | question | code | list | note | unknown",
    "text": "Extracted visible content"
  },
  "markdown_output": "Clean formatted markdown version",
  "blocks": [
    {
      "id": "block_1",
      "type": "formula",
      "title": "Pythagorean Theorem",
      "text": "a² + b² = c²",
      "markdown": "\`\`\`math\\na^2 + b^2 = c^2\\n\`\`\`",
      "bbox": [x, y, width, height],
      "confidence": 0.95
    }
  ],
  "ui_actions": {
    "highlight_pdf_region": true,
    "highlight_output_blocks": ["block_1"]
  }
}

Rules:
- Preserve formulas, scientific notation, and code exactly.
- Keep educational structure and hierarchy.
- Convert tables into markdown tables.
- Convert formulas into LaTeX when possible.
- If diagrams are present, describe them briefly.
- Do not hallucinate missing content.
- If confidence is low, reduce confidence score.
- Keep the markdown clean and readable for students.
- Output JSON only.`;
}

function parseJson(content: string) {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { error: "Could not parse OCR JSON." };
  }
}
