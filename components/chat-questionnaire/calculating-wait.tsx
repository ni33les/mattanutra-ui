"use client";

import type { ReactNode } from "react";
import { NongPoseImage } from "@/components/chat-questionnaire/nong-pose-image";

const LINE_SUPPORT_URL = "https://line.me/R/ti/p/%40344enooi";

export type CalculatingWaitCopy = Readonly<{
  body: string;
  disclaimer: string;
  kicker: string;
  line: string;
  note?: string | null;
  status: string;
  title: string;
}>;

type CalculatingWaitProps = Readonly<{
  children?: ReactNode;
  copy: CalculatingWaitCopy;
  showSupport?: boolean;
  spinning?: boolean;
  testId?: string;
}>;

export function CalculatingWait({
  children,
  copy,
  showSupport = true,
  spinning = false,
  testId
}: CalculatingWaitProps) {
  return (
    <div className="mn-quiz-calc" data-testid={testId} aria-live="polite">
      <NongPoseImage
        className="mn-quiz-calc__nong"
        height={225}
        pose="wai"
        width={210}
      />
      <div className="mn-quiz-calc__kicker">{copy.kicker}</div>
      <h1 className="mn-quiz-calc__title">{copy.title}</h1>
      <p className="mn-quiz-calc__copy">{copy.body}</p>
      <div className="mn-quiz-calc__status">
        {spinning ? (
          <span className="mn-quiz-calc__spinner" aria-hidden />
        ) : (
          <span aria-hidden>✓</span>
        )}
        <span>{copy.status}</span>
      </div>
      {children}
      {copy.note ? <p className="mn-quiz-calc__note">{copy.note}</p> : null}
      {showSupport ? (
        <>
          <div className="mn-quiz-calc__support">
            <a href={LINE_SUPPORT_URL} target="_blank" rel="noopener noreferrer">
              {copy.line}
            </a>
          </div>
          <p className="mn-quiz-calc__disclaimer">{copy.disclaimer}</p>
        </>
      ) : null}
    </div>
  );
}
