export function HighlightedBrandText({ text }: Readonly<{ text: string }>) {
  const parts = text.split(/(HealthScore|MattaNutra)/i);

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === "healthscore" ? (
          <span key={`${part}-${index}`} className="text-[var(--brand-green)]">
            {part}
          </span>
        ) : part.toLowerCase() === "mattanutra" ? (
          <span
            key={`${part}-${index}`}
            className="font-semibold text-[var(--brand-blue)]"
          >
            {part}
          </span>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  );
}
