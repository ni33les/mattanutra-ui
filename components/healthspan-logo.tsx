import type { SVGProps } from "react";

type HealthspanLogoProps = SVGProps<SVGSVGElement>;

export function HealthspanLogo(props: HealthspanLogoProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="Healthspan logo"
      {...props}
    >
      <rect width="48" height="48" rx="12" fill="#008a5b" />
      <path
        d="M8 25h9.2L22.1 12l9.8 24 4.9-11H40"
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4.2"
      />
      <path
        d="M22.1 12 31.9 36"
        fill="none"
        stroke="#baf2d0"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.3"
      />
    </svg>
  );
}
