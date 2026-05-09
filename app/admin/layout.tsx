import type { Metadata } from "next";
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

export default function AdminLayout({
  children
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

