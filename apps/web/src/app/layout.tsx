import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

// Resolve a single base URL for canonical + OG href resolution. All
// per-page metadata declares paths (e.g. "/pricing"); Next.js joins
// against this. NEXT_PUBLIC_APP_URL is the same env var the rest of the
// app uses for absolute URLs.
const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://yoboss.ai"
).replace(/\/+$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  // Template: per-page titles render as "<Page> — YoBoss". Pages can
  // opt out by exporting `title: { absolute: "..." }` (used by the
  // landing page so its title isn't suffixed twice).
  title: {
    default: "YoBoss — Your Intentional Roadmap",
    template: "%s — YoBoss",
  },
  description:
    "YoBoss turns one big goal into a phased roadmap, a weekly schedule, and a small team of digital employees that ship real work alongside you.",
  applicationName: "YoBoss",
  keywords: [
    "goal planning",
    "weekly planner",
    "AI productivity",
    "AI assistant",
    "task management",
    "personal coaching",
  ],
  authors: [{ name: "YoBoss" }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "YoBoss",
    locale: "en_US",
    url: "/",
    title: "YoBoss — Your Intentional Roadmap",
    description:
      "Describe your goal and your team plans, schedules, and ships work alongside you.",
    images: [{ url: "/default.png", alt: "YoBoss" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "YoBoss — Your Intentional Roadmap",
    description:
      "Describe your goal and your team plans, schedules, and ships work alongside you.",
    images: ["/default.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
