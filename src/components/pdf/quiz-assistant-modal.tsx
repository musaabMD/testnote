"use client";

import { getNotes } from "@/components/pdf/pdf-study-panel";
import { QuizChatBubble } from "@/components/pdf/quiz-chat-bubble";
import {
  buildQuizAssistantInstructions,
  buildQuizWelcomeMessage,
  hasUsableExplanationNotes,
  QUIZ_AUTO_EXPLAIN_PROMPT,
} from "@/lib/quiz-tutor-prompt";
import type { PdfMcq } from "@/lib/pdf-mcqs";
import { cleanExplanationText } from "@/lib/question-text";
import {
  AssistantRuntimeProvider,
  useAssistantInstructions,
  useThreadRuntime,
} from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import type { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";

function QuizAssistantInstructions({ instructions }: { instructions: string }) {
  useAssistantInstructions(instructions);
  return null;
}

function QuizExplainWhenOpened({
  open,
  question,
}: {
  open: boolean;
  question: PdfMcq;
}) {
  const runtime = useThreadRuntime();
  const requestedRef = useRef(false);
  const notes = getNotes(question).map(cleanExplanationText).filter(Boolean);

  useEffect(() => {
    requestedRef.current = false;
  }, [question]);

  useEffect(() => {
    if (!open || hasUsableExplanationNotes(notes) || requestedRef.current) return;

    requestedRef.current = true;
    void runtime.append({
      role: "user",
      content: [{ type: "text", text: QUIZ_AUTO_EXPLAIN_PROMPT }],
    });
  }, [open, notes, question, runtime]);

  return null;
}

function QuizAssistantRuntime({
  questionId,
  question,
  chatOpen,
  children,
}: {
  questionId: string;
  question: PdfMcq;
  chatOpen: boolean;
  children: React.ReactNode;
}) {
  const instructions = buildQuizAssistantInstructions(question);
  const intro = buildQuizWelcomeMessage(question);

  const runtime = useChatRuntime({
    id: questionId,
    messages: intro
      ? ([
          {
            id: `${questionId}-intro`,
            role: "assistant",
            parts: [{ type: "text", text: intro }],
          },
        ] satisfies UIMessage[])
      : [],
    transport: new AssistantChatTransport({
      api: "/api/chat",
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <QuizAssistantInstructions instructions={instructions} />
      <QuizExplainWhenOpened open={chatOpen} question={question} />
      {children}
    </AssistantRuntimeProvider>
  );
}

export function QuizAssistantModal({
  question,
  questionId,
}: {
  question: PdfMcq;
  questionId: string;
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const subtitle = question.questionNumber
    ? `Question ${question.questionNumber}`
    : "Study tutor";

  return (
    <QuizAssistantRuntime
      key={questionId}
      chatOpen={chatOpen}
      question={question}
      questionId={questionId}
    >
      <QuizChatBubble
        onOpenChange={setChatOpen}
        open={chatOpen}
        subtitle={subtitle}
        title="DrNote Tutor"
      />
    </QuizAssistantRuntime>
  );
}
