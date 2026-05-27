import type { Locale } from "@/lib/i18n";

type PathQuery = Record<string, string | undefined>;

function withQuery(path: string, query: PathQuery) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }

  const search = params.toString();

  return search ? `${path}?${search}` : path;
}

export function nutritionQuizPath(
  locale: Locale,
  planId?: string,
  extraQuery: PathQuery = {}
) {
  return withQuery(`/${locale}/nutrition/quiz`, {
    ...extraQuery,
    plan: planId
  });
}

export function nutritionHealthScorePath(locale: Locale, planId?: string) {
  return withQuery(`/${locale}/nutrition/healthscore`, { plan: planId });
}

export function nutritionRevealPath(locale: Locale, planId?: string) {
  return withQuery(`/${locale}/nutrition/reveal`, { plan: planId });
}
