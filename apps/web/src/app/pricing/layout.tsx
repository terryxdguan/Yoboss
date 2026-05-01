import type { Metadata } from "next";

// pricing/page.tsx is a client component (interactive checkout flow), so
// it can't export `metadata` directly. This route-segment layout is a
// pass-through whose only job is to attach SEO/OG metadata to the
// `/pricing` URL.
export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free tier, $9.99/mo Basic, $19.99/mo Pro — pay-as-you-go credits available. Upgrade anytime, cancel anytime.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    url: "/pricing",
    title: "Pricing — YoBoss",
    description:
      "Free tier, $9.99/mo Basic, $19.99/mo Pro — pay-as-you-go credits available.",
  },
  twitter: {
    title: "Pricing — YoBoss",
    description:
      "Free tier, $9.99/mo Basic, $19.99/mo Pro — pay-as-you-go credits available.",
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
