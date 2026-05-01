import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern your use of YoBoss — your rights, our obligations, and how the service may be used.",
  alternates: { canonical: "/terms" },
  openGraph: {
    url: "/terms",
    title: "Terms of Service — YoBoss",
    description: "The terms that govern your use of YoBoss.",
  },
  twitter: {
    title: "Terms of Service — YoBoss",
    description: "The terms that govern your use of YoBoss.",
  },
};

export default async function TermsPage() {
  const t = await getTranslations("terms");
  return (
    <div className="min-h-screen bg-[#F6F3EE]">
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
            <p>{t("s2Body")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">{t("s3Title")}</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>{t("s3L1")}</li>
              <li>{t("s3L2")}</li>
              <li>{t("s3L3")}</li>
              <li>{t("s3L4")}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">{t("s4Title")}</h2>
            <p>{t("s4Body")}</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                {t("s4L1Pre")}
                <a
                  href="https://www.anthropic.com/legal/aup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#007AFF] hover:underline"
                >
                  {t("s4L1Link")}
                </a>
                {t("s4L1Post")}
              </li>
              <li>{t("s4L2")}</li>
              <li>{t("s4L3")}</li>
              <li>{t("s4L4")}</li>
            </ul>
            <p>{t("s4Footer")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">{t("s5Title")}</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>{t("s5L1")}</li>
              <li>{t("s5L2")}</li>
              <li>{t("s5L3")}</li>
              <li>{t("s5L4")}</li>
            </ul>
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
            <p>{t("s8Body")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">{t("s9Title")}</h2>
            <p>{t("s9Body")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">{t("s10Title")}</h2>
            <p>{t("s10Body")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">{t("s11Title")}</h2>
            <p>
              {t("s11Body")}
              <a href="mailto:contact@mail.yoboss.ai" className="text-[#007AFF] hover:underline">
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
