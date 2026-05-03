const heroImageUrl = "/final.png";
const heroBottomLeftFade =
  "radial-gradient(ellipse at bottom left, rgba(251, 252, 248, 0.98) 0%, rgba(251, 252, 248, 0.78) 16%, rgba(251, 252, 248, 0.32) 31%, rgba(251, 252, 248, 0) 48%)";

export function HeroSplit() {
  return (
    <section className="grid flex-1 grid-cols-1 bg-background md:grid-cols-2">
      <div aria-hidden="true" />
      <div
        role="img"
        aria-label="Healthy and fit Asian couple outdoors"
        className="relative min-h-[22rem] overflow-hidden bg-background md:min-h-full"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${heroImageUrl})`
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: heroBottomLeftFade }}
        />
      </div>
    </section>
  );
}
