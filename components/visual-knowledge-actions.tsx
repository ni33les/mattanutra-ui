"use client";

import Link from "next/link";
import { CheckCircle2, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { VisualKnowledgeQuiz } from "@/lib/library-static";

export function VisualKnowledgeShareButton({
  copiedLabel,
  label,
  title
}: Readonly<{
  copiedLabel: string;
  label: string;
  title: string;
}>) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;

    if (navigator.share) {
      await navigator.share({ title, url }).catch(() => undefined);
      return;
    }

    await navigator.clipboard?.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      className="inline-flex items-center gap-2 rounded-pill border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-forest hover:text-forest-deep"
      onClick={share}
      type="button"
    >
      <Share2 aria-hidden={true} className="size-4" />
      {copied ? copiedLabel : label}
    </button>
  );
}

export function VisualKnowledgeQuizCard({
  assessmentHref,
  quiz
}: Readonly<{
  assessmentHref: string;
  quiz: VisualKnowledgeQuiz;
}>) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const complete = quiz.questions.length > 0 &&
    quiz.questions.every((question) => answers[question.id]);
  const selectedCount = useMemo(
    () => Object.keys(answers).filter((key) => answers[key]).length,
    [answers]
  );

  return (
    <section className="rounded-[20px] border border-line bg-cream p-5 shadow-soft sm:p-7">
      <div className="flex items-start gap-3">
        <CheckCircle2 aria-hidden={true} className="mt-1 size-5 text-forest-deep" />
        <div>
          <h2 className="font-display text-2xl leading-tight text-ink">
            {quiz.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ash">{quiz.hint}</p>
        </div>
      </div>

      <div className="mt-6 space-y-5">
        {quiz.questions.map((question) => (
          <fieldset key={question.id}>
            <legend className="text-sm font-semibold leading-relaxed text-ink">
              {question.question}
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {question.options.map((option) => {
                const active = answers[question.id] === option.value;

                return (
                  <button
                    aria-pressed={active}
                    className={
                      active
                        ? "rounded-pill bg-forest-deep px-4 py-2 text-sm font-semibold text-white"
                        : "rounded-pill border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-forest hover:text-forest-deep"
                    }
                    key={`${question.id}:${option.value}:${option.label}`}
                    onClick={() =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: option.value
                      }))
                    }
                    type="button"
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      {complete ? (
        <div className="mt-6 rounded-[16px] border border-forest/20 bg-paper p-4">
          <p className="text-sm font-bold text-forest-deep">{quiz.resultTitle}</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {quiz.resultBody}
          </p>
          <Link
            className="mt-4 inline-flex rounded-pill bg-forest-deep px-5 py-2.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
            href={assessmentHref}
          >
            {quiz.cta}
          </Link>
        </div>
      ) : (
        <p className="mt-5 text-xs text-ash">
          {selectedCount}/{quiz.questions.length}
        </p>
      )}
    </section>
  );
}
