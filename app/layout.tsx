import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "ERPNext Frontend",
  description: "Minimal frontend for stock and challan operations"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main className="mx-auto min-h-[calc(100vh-80px)] w-full max-w-5xl px-6 py-10">
          {children}
        </main>
      </body>
    </html>
  );
}
