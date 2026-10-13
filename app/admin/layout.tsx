import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "../globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false
  },
  title: "MattaNutra Admin"
};

const bodyFont = localFont({
  src: "../../public/assets/pharmacy/fonts/dm-sans.ttf",
  variable: "--mn-font-body",
  display: "swap",
  weight: "100 1000",
  style: "normal",
  adjustFontFallback: "Arial"
});

export default function AdminLayout({
  children
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={bodyFont.variable}>{children}</body>
    </html>
  );
}
