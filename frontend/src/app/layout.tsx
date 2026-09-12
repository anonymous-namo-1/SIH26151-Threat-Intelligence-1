import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Argus — Analyst Workspace",
  description:
    "Evidence-led threat intelligence. An investigation workspace for the Argus SIH26151 platform.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
