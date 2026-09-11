import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Brand typeface (Frequency Visual & Video Brand Guide): IBM Plex Mono.
// Regular for body copy; Medium/SemiBold for emphasis and headlines; no Bold.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Frequency A/B",
  description: "A short branching A/B survey.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={plexMono.variable}>
      <body>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
