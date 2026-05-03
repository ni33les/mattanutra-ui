type Feature = Readonly<{
  color: string;
  icon: "bullseye" | "shield-check" | "clock-history" | "heart";
  headline: string;
  tagline: [string, string];
}>;

const features: Feature[] = [
  {
    color: "#7ED9B7",
    icon: "bullseye",
    headline: "Personalized",
    tagline: ["Plans built for your", "unique body and goals"]
  },
  {
    color: "#3A7BD5",
    icon: "shield-check",
    headline: "Backed by science",
    tagline: ["Based on research", "not trends"]
  },
  {
    color: "#7ED9B7",
    icon: "clock-history",
    headline: "Save time & money",
    tagline: ["No more time wasted", "on bad suppliments"]
  },
  {
    color: "#3A7BD5",
    icon: "heart",
    headline: "Live better, longer",
    tagline: ["Optimise for today,", "Proactive for tomorrow"]
  }
];

function FeatureIcon({ icon }: Pick<Feature, "icon">) {
  if (icon === "bullseye") {
    return (
      <>
        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16" />
        <path d="M8 13A5 5 0 1 1 8 3a5 5 0 0 1 0 10m0 1A6 6 0 1 0 8 2a6 6 0 0 0 0 12" />
        <path d="M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6m0 1a4 4 0 1 0 0-8 4 4 0 0 0 0 8" />
        <path d="M9.5 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0" />
      </>
    );
  }

  if (icon === "shield-check") {
    return (
      <>
        <path d="M5.338 1.59a61 61 0 0 0-2.837.856.48.48 0 0 0-.328.39c-.554 4.157.726 7.19 2.253 9.188a10.7 10.7 0 0 0 2.287 2.233c.346.244.652.42.893.533q.18.085.293.118a1 1 0 0 0 .101.025 1 1 0 0 0 .1-.025q.114-.034.294-.118c.24-.113.547-.29.893-.533a10.7 10.7 0 0 0 2.287-2.233c1.527-1.997 2.807-5.031 2.253-9.188a.48.48 0 0 0-.328-.39c-.651-.213-1.75-.56-2.837-.855C9.552 1.29 8.531 1.067 8 1.067c-.53 0-1.552.223-2.662.524zM5.072.56C6.157.265 7.31 0 8 0s1.843.265 2.928.56c1.11.3 2.229.655 2.887.87a1.54 1.54 0 0 1 1.044 1.262c.596 4.477-.787 7.795-2.465 9.99a11.8 11.8 0 0 1-2.517 2.453 7 7 0 0 1-1.048.625c-.28.132-.581.24-.829.24s-.548-.108-.829-.24a7 7 0 0 1-1.048-.625 11.8 11.8 0 0 1-2.517-2.453C1.928 10.487.545 7.169 1.141 2.692A1.54 1.54 0 0 1 2.185 1.43 63 63 0 0 1 5.072.56" />
        <path d="M10.854 5.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 7.793l2.646-2.647a.5.5 0 0 1 .708 0" />
      </>
    );
  }

  if (icon === "clock-history") {
    return (
      <>
        <path d="M8.515 1.019A7 7 0 0 0 8 1V0a8 8 0 0 1 .589.022zm2.004.45a7 7 0 0 0-.985-.299l.219-.976q.576.129 1.126.342zm1.37.71a7 7 0 0 0-.439-.27l.493-.87a8 8 0 0 1 .979.654l-.615.789a7 7 0 0 0-.418-.302zm1.834 1.79a7 7 0 0 0-.653-.796l.724-.69q.406.429.747.91zm.744 1.352a7 7 0 0 0-.214-.468l.893-.45a8 8 0 0 1 .45 1.088l-.95.313a7 7 0 0 0-.179-.483m.53 2.507a7 7 0 0 0-.1-1.025l.985-.17q.1.58.116 1.17zm-.131 1.538q.05-.254.081-.51l.993.123a8 8 0 0 1-.23 1.155l-.964-.267q.069-.247.12-.501m-.952 2.379q.276-.436.486-.908l.914.405q-.24.54-.555 1.038zm-.964 1.205q.183-.183.35-.378l.758.653a8 8 0 0 1-.401.432z" />
        <path d="M8 1a7 7 0 1 0 4.95 11.95l.707.707A8.001 8.001 0 1 1 8 0z" />
        <path d="M7.5 3a.5.5 0 0 1 .5.5v5.21l3.248 1.856a.5.5 0 0 1-.496.868l-3.5-2A.5.5 0 0 1 7 9V3.5a.5.5 0 0 1 .5-.5" />
      </>
    );
  }

  return (
    <path d="m8 2.748-.717-.737C5.6.281 2.514.878 1.4 3.053c-.523 1.023-.641 2.5.314 4.385.92 1.815 2.834 3.989 6.286 6.357 3.452-2.368 5.365-4.542 6.286-6.357.955-1.886.838-3.362.314-4.385C13.486.878 10.4.28 8.717 2.01zM8 15C-7.333 4.868 3.279-3.04 7.824 1.143q.09.083.176.171a3 3 0 0 1 .176-.17C12.72-3.042 23.333 4.867 8 15" />
  );
}

export function FeatureRow() {
  return (
    <section className="bg-white">
      <div className="mx-auto grid w-full max-w-6xl auto-rows-[10.5rem] grid-cols-2 gap-0 bg-white px-4 sm:px-6 md:grid-cols-4 lg:px-8">
        {features.map((feature) => (
          <article
            key={feature.headline}
            className="grid h-full grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-2 bg-white px-3 py-6"
          >
            <div
              className="flex h-full items-center justify-center rounded-md"
              style={{ color: feature.color }}
            >
              <svg
                viewBox="0 0 16 16"
                className="h-9 w-9"
                fill="currentColor"
                aria-hidden="true"
              >
                <FeatureIcon icon={feature.icon} />
              </svg>
            </div>

            <div className="flex min-w-0 flex-col justify-center">
              <h2 className="whitespace-nowrap text-[10px] font-bold uppercase leading-5 tracking-[0.04em] text-[#17262B] xl:text-[11px]">
                {feature.headline}
              </h2>
              <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground xl:text-xs">
                {feature.tagline[0]}
                <br />
                {feature.tagline[1]}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
