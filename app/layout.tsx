import type { Metadata } from "next";
import { DashboardProvider } from "./dashboard";
import "./globals.css";

export const metadata: Metadata = {
  title: "SokaFix · Football Fixtures & Accumulator Builder",
  description:
    "Aggregated football fixtures with AI-powered prompting, predictions, odds and instant multi-leg accumulator construction.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 font-sans text-slate-200">
        <DashboardProvider>{children}</DashboardProvider>
      </body>
    </html>
  );
}
