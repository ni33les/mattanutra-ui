export function HighlightedBrandText({ text }: Readonly<{ text: string }>) {
  const parts = text.split(/(HealthScore|MattaNutra)/i);

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === "healthscore" ? (
          <span key={`${part}-${index}`} className="text-[#1FA77A]">
            {part}
          </span>
        ) : part.toLowerCase() === "mattanutra" ? (
          <span
            key={`${part}-${index}`}
            className="font-semibold text-[#3A7BD5]"
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
