"use client";

import { useMemo } from "react";
import TypeIt from "typeit-react";

type AnimatedHeroCopyProps = Readonly<{
  title: string;
  subtitle: string;
  followOn?: string;
}>;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function AnimatedHeroCopy({
  title,
  subtitle,
  followOn
}: AnimatedHeroCopyProps) {
  const animationKey = `${title}-${subtitle}-${followOn ?? ""}`;

  const titleHtml = useMemo(
    () =>
      `<h1 class="text-balance text-6xl font-semibold leading-tight sm:text-7xl lg:text-8xl">${escapeHtml(
        title
      )}</h1>`,
    [title]
  );

  const subtitleHtml = useMemo(
    () =>
      `<p class="mt-7 max-w-3xl text-pretty text-xl leading-9 text-muted-foreground sm:text-2xl sm:leading-10">${escapeHtml(
        subtitle
      )}</p>`,
    [subtitle]
  );

  const followOnHtml = useMemo(
    () =>
      followOn
        ? `<p class="mt-5 max-w-3xl text-pretty text-2xl font-medium leading-9 text-foreground sm:text-3xl sm:leading-10">${escapeHtml(
            followOn
          )}</p>`
        : "",
    [followOn]
  );

  return (
    <TypeIt
      key={animationKey}
      as="div"
      aria-label={[title, subtitle, followOn].filter(Boolean).join(" ")}
      className="typeit-hero"
      options={{
        cursor: true,
        cursorChar: "|",
        html: true,
        lifeLike: true,
        speed: 15,
        startDelay: 250,
        waitUntilVisible: true
      }}
      getBeforeInit={(instance) => {
        instance
          .type(titleHtml)
          .pause(220)
          .type(subtitleHtml)
          .pause(180);

        if (followOnHtml) {
          instance.type(followOnHtml);
        }

        return instance;
      }}
    />
  );
}
