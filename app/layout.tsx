import type { Metadata } from "next";
import { AccessShell } from "./access-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "SokaFix · Football Fixtures & Accumulator Builder",
  description:
    "Football fixtures, prediction filters, odds and multi-leg accumulator construction.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 font-sans text-slate-200">
        <AccessShell>{children}</AccessShell>
      </body>
    </html>
  );
}
