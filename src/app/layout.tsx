import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Mandate Rescue - Automated UPI Autopay Recovery",
  description: "Detect, diagnose, and recover failed UPI Autopay / e-mandate subscription payments with compliance, stopping rules, and full audit trail.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`font-sans font-light antialiased bg-[#000000] text-slate-100 min-h-screen flex`}
      >
        <Sidebar />
        <main className="flex-1 p-8 overflow-y-auto max-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}


