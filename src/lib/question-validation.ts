import {
  getCorrectAnswer,
  getNotes,
  getOptions,
  getQuestionText,
  optionMatchesAnswer,
} from "@/components/pdf/pdf-study-panel";
import type { PdfMcq } from "@/lib/pdf-mcqs";
import {
  cleanQuestionDisplayText,
  getRawQuestionText,
  getResolvedQuestionText,
  hasGrammarProblems,
} from "@/lib/question-text";
import type { QuestionEditRecord } from "@/lib/question-edits";

export type QuestionIssueSeverity = "error" | "warning" | "info";

export type QuestionIssue = {
  id: string;
  severity: QuestionIssueSeverity;
  message: string;
  field: "question" | "choices" | "answer" | "explanation" | "grammar" | "verification";
};

export type AnswerProvenance = {
  source: "file" | "ai" | "mixed";
  label: string;
  detail: string;
};

export function getAnswerProvenance(question: PdfMcq): AnswerProvenance {
  const answer = getCorrectAnswer(question);
  const notes = getNotes(question).filter(Boolean);
  const options = getOptions(question);
  const fromFilePage = Boolean(question.sourcePage);
  const raw = question.rawJson as Record<string, unknown> | undefined;
  const generated = raw?.generated === true || raw?.aiGenerated === true;

  if (generated) {
    return {
      source: "ai",
      label: "AI generated",
      detail: "Answer or choices may have been generated, not copied from the file.",
    };
  }

  if (answer && fromFilePage && notes.length > 0) {
    return {
      source: "file",
      label: "From file",
      detail: `Answer and notes extracted from page ${question.sourcePage}.`,
    };
  }

  if (answer && fromFilePage) {
    return {
      source: "mixed",
      label: "Answer from file",
      detail: "Correct answer was found in the file, but no explanation was extracted.",
    };
  }

  if (answer && options.some((option) => optionMatchesAnswer(option, answer))) {
    return {
      source: "mixed",
      label: "Needs verification",
      detail: "Answer key exists but source page or explanation is missing.",
    };
  }

  return {
    source: "ai",
    label: "Unverified",
    detail: "Answer key may be incomplete or AI-inferred — verify before trusting.",
  };
}

export function getExplanationProvenance(question: PdfMcq): AnswerProvenance {
  const notes = getNotes(question).map((note) => note.trim()).filter(Boolean);
  const generated = (question.rawJson as Record<string, unknown> | undefined)?.generated === true;

  if (notes.length > 0 && question.sourcePage) {
    return {
      source: "file",
      label: "Explanation from file",
      detail: "Notes were extracted from the uploaded document.",
    };
  }

  if (notes.length > 0) {
    return {
      source: "mixed",
      label: "Partial explanation",
      detail: "Some notes exist but may not match the source page.",
    };
  }

  if (generated) {
    return {
      source: "ai",
      label: "AI explanation only",
      detail: "No explanation was found in the file — tutor uses AI reasoning.",
    };
  }

  return {
    source: "ai",
    label: "Tutor explains",
    detail: "No notes in the file — choice explanations appear after you answer.",
  };
}

export function validateQuestion(
  question: PdfMcq,
  edit?: QuestionEditRecord,
): QuestionIssue[] {
  const issues: QuestionIssue[] = [];
  const options = getOptions(question);
  const answer = getCorrectAnswer(question);
  const rawQuestionText = getRawQuestionText(question);
  const displayText = getResolvedQuestionText(question, edit);

  if (!displayText.trim()) {
    issues.push({
      id: "missing-question",
      severity: "error",
      message: "Question text is missing.",
      field: "question",
    });
  }

  if (options.length === 0) {
    issues.push({
      id: "missing-choices",
      severity: "error",
      message: "You did not add choices.",
      field: "choices",
    });
  } else if (options.length < 4) {
    issues.push({
      id: "few-choices",
      severity: "error",
      message: `Only ${options.length} choice${options.length === 1 ? "" : "s"} — need at least 4.`,
      field: "choices",
    });
  }

  if (!answer.trim()) {
    issues.push({
      id: "missing-answer",
      severity: "error",
      message: "Correct answer is missing.",
      field: "answer",
    });
  } else if (!options.some((option) => optionMatchesAnswer(option, answer))) {
    issues.push({
      id: "answer-key-mismatch",
      severity: "error",
      message: `Answer key "${answer}" does not match any choice — verify if the question is correct.`,
      field: "verification",
    });
  }

  if (cleanQuestionDisplayText(rawQuestionText) !== rawQuestionText && rawQuestionText.includes("{")) {
    issues.push({
      id: "placeholder-text",
      severity: "warning",
      message: "Question contains placeholder or image description text.",
      field: "question",
    });
  }

  const grammarText = edit?.questionText ?? rawQuestionText;
  const grammarOptions = edit?.options ?? options;
  const questionHasGrammarIssues = hasGrammarProblems(grammarText);
  const optionsHaveGrammarIssues = grammarOptions.some((option) =>
    hasGrammarProblems(option.text),
  );

  if (questionHasGrammarIssues || optionsHaveGrammarIssues) {
    issues.push({
      id: "grammar-issues",
      severity: "warning",
      message: "Grammar or OCR formatting looks off — tap the grammar icon to fix it.",
      field: "grammar",
    });
  }

  return issues;
}

export function buildQuizletSearchUrl(question: PdfMcq): string {
  const text = getQuestionText(question).slice(0, 140);
  return `https://www.google.com/search?q=${encodeURIComponent(`${text} site:quizlet.com`)}`;
}

export function buildWebSearchUrl(question: PdfMcq): string {
  const text = getQuestionText(question).slice(0, 140);
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
}

export function fieldHasIssue(issues: QuestionIssue[], field: QuestionIssue["field"]) {
  return issues.some((issue) => issue.field === field && issue.severity !== "info");
}

export function fieldHasError(issues: QuestionIssue[], field: QuestionIssue["field"]) {
  return issues.some((issue) => issue.field === field && issue.severity === "error");
}
