import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { FlowProvider } from "@/components/flow-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flowlist — AI playlist sequencing",
  description:
    "Reorder playlists for emotional and rhythmic continuity. Prototype with mock data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        <FlowProvider>{children}</FlowProvider>
      </body>
    </html>
  );
}
