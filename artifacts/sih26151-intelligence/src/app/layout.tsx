import type { Metadata } from "next";
import "../index.css";

export const metadata: Metadata = {
  title: "ARGUS - Threat Intelligence",
  description: "Evidence-led case investigation workbench for authorized professional cyber investigators.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased text-foreground bg-background">
        {children}
      </body>
    </html>
  );
}
