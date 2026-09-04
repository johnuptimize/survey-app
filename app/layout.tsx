import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
