import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  // Title template ("%s — YoBoss") in the root layout adds the suffix.
  title: "Privacy Policy",
  description:
    "How YoBoss collects, uses, and protects your data — what we store, who we share it with, and your rights.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    url: "/privacy",
    title: "Privacy Policy — YoBoss",
    description: "How YoBoss collects, uses, and protects your data.",
  },
  twitter: {
    title: "Privacy Policy — YoBoss",
    description: "How YoBoss collects, uses, and protects your data.",
  },
};

export default async function PrivacyPage() {
  const t = await getTranslations("privacy");
  return (
    <div className="min-h-screen bg-[#FDFAF6]">
      <div className="max-w-3xl mx-auto px-6 pt-6 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tighter text-[#2B2B2B]">
          YoBoss
        </Link>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-[#2B2B2B] mb-3">{t("title")}</h1>
        <p className="text-sm text-[#9B948B] mb-10">{t("lastUpdated")}</p>

        <div className="prose prose-sm max-w-none text-[#2B2B2B] space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">{t("s1Title")}</h2>
            <p>{t("s1Body")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">{t("s2Title")}</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>{t("s2L1")}</li>
              <li>{t("s2L2")}</li>
              <li>{t("s2L3")}</li>
              <li>{t("s2L4")}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">{t("s3Title")}</h2>
            <p>{t("s3Body")}</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>{t("s3L1Name")}</strong>{t("s3L1Body")}</li>
              <li><strong>{t("s3L2Name")}</strong>{t("s3L2Body")}</li>
              <li><strong>{t("s3L3Name")}</strong>{t("s3L3Body")}</li>
              <li><strong>{t("s3L4Name")}</strong>{t("s3L4Body")}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">{t("s4Title")}</h2>
            <p>{t("s4Body")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">{t("s5Title")}</h2>
            <p>{t("s5Body")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">{t("s6Title")}</h2>
            <p>{t("s6Body")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">{t("s7Title")}</h2>
            <p>{t("s7Body")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">{t("s8Title")}</h2>
            <p>
              {t("s8Body")}
              <a href="mailto:contact@mail.yoboss.ai" className="text-[#7C2DE8] hover:underline">
                contact@mail.yoboss.ai
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
