import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
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

const bodyFont = DM_Sans({
  subsets: ["latin"],
  variable: "--mn-font-body",
  display: "swap"
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
