"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import type {
  VisualKnowledgeNode,
  VisualKnowledgeQuiz
} from "@/lib/library-static";
import { nutritionQuizPath } from "@/lib/nutrition-paths";

type RenderContext = Readonly<{
  inCta: boolean;
  inHero: boolean;
  questionId?: string;
}>;

type LibraryVisualPageProps = Readonly<{
  articleUrl: string;
  copiedLabel: string;
  locale: Locale;
  nodes: readonly VisualKnowledgeNode[];
  quiz: VisualKnowledgeQuiz;
  shareLabel: string;
  slug: string;
}>;

type VisualKnowledgeElementNode = Extract<
  VisualKnowledgeNode,
  { type: "element" }
>;

function classList(value: unknown) {
  return typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
}

function hasClass(value: unknown, className: string) {
  return classList(value).includes(className);
}

function attrString(
  attrs: Readonly<Record<string, string | boolean>> | undefined,
  key: string
) {
  const value = attrs?.[key];

  return typeof value === "string" ? value : null;
}

function textFromNode(node: VisualKnowledgeNode): string {
  if (node.type === "text") {
    return node.text;
  }

  if (node.type === "image" || node.type === "icon") {
    return "";
  }

  return node.children.map(textFromNode).join("");
}

function nodeHasElement(
  node: VisualKnowledgeNode,
  predicate: (node: VisualKnowledgeElementNode) => boolean
): boolean {
  if (node.type === "element") {
    if (predicate(node)) {
      return true;
    }

    return node.children.some((child) => nodeHasElement(child, predicate));
  }

  if (node.type === "fragment") {
    return node.children.some((child) => nodeHasElement(child, predicate));
  }

  return false;
}

function isShareFragment(node: Extract<VisualKnowledgeNode, { type: "fragment" }>) {
  const text = textFromNode(node).trim().replace(/\s+/g, " ");

  return (
    /^(Share this guide|แชร์|分享本指南)/i.test(text) ||
    nodeHasElement(node, (element) => {
      const id = attrString(element.attrs, "id");

      return (
        id === "share-line" ||
        id === "share-facebook" ||
        id === "shareBtn" ||
        id === "shareBottom" ||
        id === "copyBtn" ||
        "data-share" in (element.attrs ?? {}) ||
        "data-copy" in (element.attrs ?? {})
      );
    })
  );
}

function isRelatedFragment(
  node: Extract<VisualKnowledgeNode, { type: "fragment" }>
) {
  const text = textFromNode(node).trim().replace(/\s+/g, " ");
  const hasRelatedHeading = /^(Related topics|หัวข้อที่เกี่ยวข้อง|相关主题)/i.test(
    text
  );
  const hasLibraryLinks = nodeHasElement(node, (element) => {
    const href = attrString(element.attrs, "href");

    return element.tag === "a" && Boolean(href?.includes("/library/"));
  });

  return hasRelatedHeading && hasLibraryLinks;
}

function hasNutritionQuizLink(nodes: readonly VisualKnowledgeNode[]) {
  return nodes.some((node) =>
    nodeHasElement(node, (element) => {
      const href = attrString(element.attrs, "href");

      return element.tag === "a" && Boolean(href?.includes("/nutrition/quiz"));
    })
  );
}

function collectQuestionCount(nodes: readonly VisualKnowledgeNode[]) {
  let count = 0;

  function visit(node: VisualKnowledgeNode) {
    if (node.type === "element" && hasClass(node.attrs?.className, "q")) {
      count += 1;
      return;
    }

    if (node.type === "element" || node.type === "fragment") {
      node.children.forEach(visit);
    }
  }

  nodes.forEach(visit);

  return count;
}

function normalizedOptionValue(node: VisualKnowledgeNode) {
  const text = textFromNode(node).trim().toLowerCase();

  if (text === "yes" || text === "ใช่" || text === "是") {
    return "yes";
  }

  if (text === "no" || text === "ไม่ใช่" || text === "否") {
    return "no";
  }

  return text || "selected";
}

function elementProps(
  attrs: Readonly<Record<string, string | boolean>> | undefined,
  extraClassName?: string
) {
  const props: Record<string, unknown> = {};

  if (!attrs) {
    return extraClassName ? { className: extraClassName } : props;
  }

  for (const [key, value] of Object.entries(attrs)) {
    if (
      key === "className" ||
      key === "id" ||
      key === "role" ||
      key === "aria-label" ||
      key.startsWith("data-")
    ) {
      props[key] = value;
    } else if (key === "open" && value === true) {
      props.open = true;
    }
  }

  if (extraClassName) {
    props.className = [props.className, extraClassName].filter(Boolean).join(" ");
  }

  return props;
}

function isInternalHref(href: string) {
  return href.startsWith("/") || href.startsWith("#");
}

function imageClassName(node: Extract<VisualKnowledgeNode, { type: "image" }>) {
  const classes = classList(node.className);
  const fileName = node.src.split("/").pop() ?? "";
  const nongMatch = /^nong-([a-z0-9-]+)\.(?:jpe?g|png|webp)$/i.exec(fileName);

  if (node.src.startsWith("/assets/library/nong/")) {
    classes.push("mn-nong-img");
  }

  if (nongMatch) {
    classes.push(`mn-nong-${nongMatch[1]}`);
  }

  return classes.join(" ");
}

export function LibraryVisualPage({
  articleUrl,
  copiedLabel,
  locale,
  nodes,
  quiz,
  shareLabel,
  slug
}: LibraryVisualPageProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const requiredAnswerCount = useMemo(
    () => Math.max(quiz.questions.length, collectQuestionCount(nodes), 1),
    [nodes, quiz.questions.length]
  );
  const completedQuiz = Object.keys(answers).length >= requiredAnswerCount;
  const lineShareHref = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(
    articleUrl
  )}`;
  const facebookShareHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
    articleUrl
  )}`;
  const quizCtaLabel = quiz.cta.trim();

  async function copyArticleUrl() {
    try {
      await navigator.clipboard?.writeText(articleUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt(copiedLabel, articleUrl);
    }
  }

  async function shareArticle() {
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url: articleUrl });
        return;
      } catch {
        // Falling back to copy keeps the button useful after a cancelled share.
      }
    }

    await copyArticleUrl();
  }

  function renderQuizResultCta(key: string) {
    if (!quizCtaLabel) {
      return null;
    }

    return (
      <Link
        className="btn mn-quiz-result-cta"
        href={nutritionQuizPath(locale)}
        key={key}
      >
        {quizCtaLabel}
      </Link>
    );
  }

  function renderNode(
    node: VisualKnowledgeNode,
    key: string,
    context: RenderContext = { inCta: false, inHero: false }
  ): ReactNode {
    if (node.type === "text") {
      return node.text;
    }

    if (node.type === "fragment") {
      if (isShareFragment(node)) {
        return (
          <div className="share mn-library-fragment" key={key}>
            {node.children.map((child, index) =>
              renderNode(child, `${key}:${index}`, context)
            )}
          </div>
        );
      }

      if (isRelatedFragment(node)) {
        return (
          <div className="related mn-library-fragment" key={key}>
            {node.children.map((child, index) =>
              renderNode(child, `${key}:${index}`, context)
            )}
          </div>
        );
      }

      return (
        <span className="mn-library-fragment" key={key}>
          {node.children.map((child, index) =>
            renderNode(child, `${key}:${index}`, context)
          )}
        </span>
      );
    }

    if (node.type === "icon") {
      return (
        <span
          aria-hidden={true}
          className={["ic", node.className].filter(Boolean).join(" ")}
          key={key}
        />
      );
    }

    if (node.type === "image") {
      const priority = context.inHero || classList(node.className).includes("av");

      return (
        <Image
          alt={node.alt}
          className={imageClassName(node)}
          height={node.height}
          key={key}
          priority={priority}
          sizes={
            priority
              ? "(min-width: 1024px) 520px, 82vw"
              : "(min-width: 1024px) 360px, 82vw"
          }
          src={node.src}
          unoptimized={node.src.startsWith("/assets/library/")}
          width={node.width}
        />
      );
    }

    const attrs = node.attrs ?? {};
    const tagClassName = attrString(attrs, "className");
    const nextContext = {
      inCta: context.inCta || hasClass(tagClassName, "cta"),
      inHero: context.inHero || hasClass(tagClassName, "hero"),
      questionId: hasClass(tagClassName, "q") ? `q:${key}` : context.questionId
    };
    const children = node.children.map((child, index) =>
      renderNode(child, `${key}:${index}`, nextContext)
    );

    if (node.tag === "a") {
      const rawHref = attrString(attrs, "href") ?? "#";
      const id = attrString(attrs, "id");
      const href =
        id === "share-line"
          ? lineShareHref
          : id === "share-facebook"
            ? facebookShareHref
            : rawHref;
      const props = elementProps(
        { ...attrs, href },
        context.inCta && hasClass(tagClassName, "btn") ? "mn-cta-action" : undefined
      );

      if (isInternalHref(href)) {
        return (
          <Link href={href} key={key} {...props}>
            {children}
          </Link>
        );
      }

      return (
        <a
          href={href}
          key={key}
          rel="noopener noreferrer"
          target="_blank"
          {...props}
        >
          {children}
        </a>
      );
    }

    if (node.tag === "button") {
      const questionId = attrString(attrs, "data-q") ?? context.questionId;
      const optionValue = attrString(attrs, "data-val") ?? normalizedOptionValue(node);
      const isQuizOption = Boolean(questionId);
      const isSelected = Boolean(
        isQuizOption && questionId && answers[questionId] === optionValue
      );
      const isShareButton =
        "data-share" in attrs ||
        attrString(attrs, "id") === "shareBtn" ||
        attrString(attrs, "id") === "shareBottom";
      const isCopyButton =
        "data-copy" in attrs || attrString(attrs, "id") === "copyBtn";
      const extraClassName = isSelected ? "active" : undefined;
      const buttonProps = elementProps(attrs, extraClassName);

      if (isShareButton && !buttonProps["aria-label"]) {
        buttonProps["aria-label"] = shareLabel;
      }

      return (
        <button
          key={key}
          type="button"
          {...buttonProps}
          aria-pressed={isQuizOption ? isSelected : undefined}
          onClick={
            isQuizOption && questionId
              ? () =>
                  setAnswers((current) => ({
                    ...current,
                    [questionId]: optionValue
                  }))
              : isShareButton
                ? shareArticle
                : isCopyButton
                  ? copyArticleUrl
                  : undefined
          }
        >
          {children}
        </button>
      );
    }

    const props = elementProps(attrs);
    const resultClassName = String(props.className ?? "");

    if (
      node.tag === "div" &&
      (hasClass(resultClassName, "result") ||
        attrString(attrs, "id") === "quiz-result" ||
        attrString(attrs, "id") === "quizResult")
    ) {
      props.className = [resultClassName, completedQuiz ? "on" : ""]
        .filter(Boolean)
        .join(" ");

      return (
        <div key={key} {...props}>
          {node.children.length ? (
            <>
              {children}
              {hasNutritionQuizLink(node.children)
                ? null
                : renderQuizResultCta(`${key}:quiz-cta`)}
            </>
          ) : (
            <>
              <b>{quiz.resultTitle}</b>
              <span className="mn-quiz-result-body">{quiz.resultBody}</span>
              {renderQuizResultCta(`${key}:quiz-cta`)}
            </>
          )}
        </div>
      );
    }

    return (
      <node.tag key={key} {...props}>
        {children}
      </node.tag>
    );
  }

  return (
    <article
      className="mn-library-visual bg-cream"
      data-library-slug={slug}
      data-locale={locale}
    >
      <div aria-live="polite" className="sr-only">
        {copied ? copiedLabel : ""}
      </div>
      <div className="wrap">
        {nodes.map((node, index) => renderNode(node, `node:${index}`))}
      </div>
    </article>
  );
}
