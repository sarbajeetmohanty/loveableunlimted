import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Bundlee Admin — License Dashboard",
  description: "License key management for Loveable Unlimited extension",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-[#07070f] text-white antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
