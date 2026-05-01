import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

// Override the title template ("%s — YoBoss") so the homepage shows
// the brand-led title rather than "Home — YoBoss".
export const metadata: Metadata = {
  title: { absolute: "YoBoss — Your Intentional Roadmap" },
  description:
    "Turn any goal into a phased roadmap, a weekly schedule, and real work shipped by a small AI team. Goal planning, weekly tasks, and deliverables in one place.",
  alternates: { canonical: "/" },
  openGraph: {
    url: "/",
    title: "YoBoss — Your Intentional Roadmap",
    description:
      "Turn any goal into a phased roadmap, a weekly schedule, and real work shipped by a small AI team.",
  },
  twitter: {
    title: "YoBoss — Your Intentional Roadmap",
    description:
      "Turn any goal into a phased roadmap, a weekly schedule, and real work shipped by a small AI team.",
  },
};

export default function Home() {
  return <LandingPage />;
}
