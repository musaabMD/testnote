import { enforceApiRateLimit } from "@/lib/api-rate-limit.server";
import { releaseQuotaReservation } from "@/lib/convex-usage-client.server";
import {
  extractOpenRouterContent,
  getOpenRouterApiKey,
  getOpenRouterMaxTokens,
  getOpenRouterModel,
  parseJsonFromModel,
} from "@/lib/openrouter-client";
import {
  heuristicOnboardingExamSuggestions,
  normalizeOnboardingExamSuggestions,
  ONBOARDING_EXAM_OPTIONS,
} from "@/lib/onboarding-exams";
import {
  estimateGrammarCostUsd,
  reserveCostUsd,
} from "@/lib/plan-limits.server";
import { getQuotaSubjectDetails } from "@/lib/request-user.server";
import { preflightTrackedAiCall, trackedOpenRouterFetch } from "@/lib/tracked-openrouter.server";
import { inferUploadMimeType } from "@/lib/upload-file-types";

export const runtime = "nodejs";

const MAX_FILES = 3;
const MAX_TEXT_CHARS = 6000;
const MAX_TEXT_FILE_BYTES = 800 * 1024;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

type FileEvidence = {
  name: string;
  type: string;
  size: number;
  textSample?: string;
};

type FileAttachment = {
  filename: string;
  mimeType: string;
  dataUrl: string;
};

export async function POST(request: Request) {
  const rateLimited = await enforceApiRateLimit(request, "grammarFix");
  if (rateLimited) return rateLimited;

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return Response.json({ error: "Upload context is required." }, { status: 400 });
  }

  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File)
    .slice(0, MAX_FILES);
  const fileNames = [
    ...files.map((file) => file.name),
    ...formData.getAll("fileNames").flatMap((value) => {
      if (typeof value !== "string") return [];
      return value
        .split("\n")
        .map((name) => name.trim())
        .filter(Boolean);
    }),
  ];
  const locale = readFormString(formData, "locale");
  const timeZone = readFormString(formData, "timeZone");
  const countryName = readFormString(formData, "countryName");
  const evidence = await Promise.all(files.map(readFileEvidence));
  const attachment = await buildAttachment(files);
  const heuristicSuggestions = heuristicOnboardingExamSuggestions({
    fileNames,
    locale,
    timeZone,
    text: evidence.map((item) => item.textSample ?? "").join("\n"),
  });

  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    return Response.json({
      suggestions: heuristicSuggestions,
      source: "heuristic",
    });
  }

  const quotaSubject = await getQuotaSubjectDetails(request);
  const model = getOpenRouterModel("OPENROUTER_ONBOARDING_MODEL");
  const preflight = await preflightTrackedAiCall({
    clerkUserId: quotaSubject.clerkUserId,
    email: quotaSubject.email,
    feature: "grammar",
    estimatedCostUsd: reserveCostUsd(estimateGrammarCostUsd()),
    model,
  });

  if (!preflight.allowed) {
    return Response.json({
      suggestions: heuristicSuggestions,
      source: "heuristic",
    });
  }

  try {
    const contentParts: Array<
      | { type: "text"; text: string }
      | { type: "file"; file: { filename: string; file_data: string } }
    > = [
      {
        type: "text",
        text: buildPrompt({
          locale,
          timeZone,
          countryName,
          fileNames,
          evidence,
        }),
      },
    ];

    if (attachment) {
      contentParts.push({
        type: "file",
        file: {
          filename: attachment.filename,
          file_data: attachment.dataUrl,
        },
      });
    }

    const { response, data } = await trackedOpenRouterFetch(
      {
        clerkUserId: quotaSubject.clerkUserId,
        email: quotaSubject.email,
        feature: "grammar",
        reservationId: preflight.reservationId,
      },
      model,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
          "X-Title": "DrNote Onboarding Exam Suggestions",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: getOpenRouterMaxTokens("OPENROUTER_ONBOARDING_MAX_TOKENS", 600),
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You classify study uploads into one of DrNote's supported Saudi exam tags. Return only valid JSON.",
            },
            {
              role: "user",
              content: contentParts,
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      return Response.json({
        suggestions: heuristicSuggestions,
        source: "heuristic",
      });
    }

    const raw = data as {
      choices?: Array<{
        message?: { content?: string | Array<{ type?: string; text?: string }> };
      }>;
    } | null;
    const rawContent = extractOpenRouterContent(raw?.choices?.[0]?.message?.content);
    const parsed = rawContent ? parseJsonFromModel(rawContent) : null;
    const suggestions = normalizeOnboardingExamSuggestions(parsed);
    return Response.json({
      suggestions: suggestions.length ? suggestions : heuristicSuggestions,
      source: suggestions.length ? "ai" : "heuristic",
    });
  } catch {
    return Response.json({
      suggestions: heuristicSuggestions,
      source: "heuristic",
    });
  } finally {
    if (preflight.reservationId) {
      await releaseQuotaReservation(preflight.reservationId);
    }
  }
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function readFileEvidence(file: File): Promise<FileEvidence> {
  const type = inferUploadMimeType(file);
  const evidence: FileEvidence = {
    name: file.name,
    type,
    size: file.size,
  };

  if (
    file.size <= MAX_TEXT_FILE_BYTES &&
    (type.startsWith("text/") || type === "application/rtf")
  ) {
    evidence.textSample = (await file.text()).replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS);
  }

  return evidence;
}

async function buildAttachment(files: File[]): Promise<FileAttachment | null> {
  const file = files.find((candidate) => {
    const type = inferUploadMimeType(candidate);
    return (
      candidate.size > 0 &&
      candidate.size <= MAX_ATTACHMENT_BYTES &&
      (type === "application/pdf" || type.startsWith("image/"))
    );
  });

  if (!file) return null;

  const mimeType = inferUploadMimeType(file);
  const bytes = Buffer.from(await file.arrayBuffer());
  return {
    filename: file.name,
    mimeType,
    dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
  };
}

function buildPrompt(input: {
  locale: string;
  timeZone: string;
  countryName: string;
  fileNames: string[];
  evidence: FileEvidence[];
}) {
  return [
    "Pick up to 4 likely tags from this exact allowed list.",
    "Do not invent exams. Prefer Saudi Arabia matches when location context points there.",
    "Use file names, visible attached-file content, and any text samples.",
    "",
    `Allowed tags: ${JSON.stringify(
      ONBOARDING_EXAM_OPTIONS.map((exam) => ({
        slug: exam.slug,
        name: exam.name,
        category: exam.category,
        countryName: exam.countryName,
      })),
    )}`,
    "",
    `User context: ${JSON.stringify({
      locale: input.locale,
      timeZone: input.timeZone,
      countryName: input.countryName,
    })}`,
    `File names: ${JSON.stringify(input.fileNames)}`,
    `File evidence: ${JSON.stringify(input.evidence)}`,
    "",
    'Return JSON: {"suggestions":[{"slug":"smle","confidence":0.0,"reason":"short reason"}]}',
  ].join("\n");
}
