import Link from "next/link";

export const metadata = {
  title: "Terms of Service — YoBoss",
  description: "The terms that govern your use of YoBoss.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#F6F3EE]">
      <div className="max-w-3xl mx-auto px-6 pt-6 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tighter text-[#2B2B2B]">
          YoBoss
        </Link>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-[#2B2B2B] mb-3">Terms of Service</h1>
        <p className="text-sm text-[#9B948B] mb-10">Last updated: April 27, 2026</p>

        <div className="prose prose-sm max-w-none text-[#2B2B2B] space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">1. Acceptance</h2>
            <p>
              By creating a YoBoss account or using the service you agree to these Terms. If you
              don&apos;t agree, don&apos;t use the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">2. The service</h2>
            <p>
              YoBoss is a goal-planning and AI-assisted task-management product. Features and
              capabilities may evolve over time. We aim to give reasonable advance notice before
              removing or materially changing features paid users rely on.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">3. Your account</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>You are responsible for the activity under your account.</li>
              <li>Don&apos;t share credentials. One human per account.</li>
              <li>Provide accurate registration information.</li>
              <li>You must be at least 13 years old (or the digital-consent age in your jurisdiction).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">4. Acceptable use</h2>
            <p>You agree NOT to use YoBoss to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Generate content that violates Anthropic&apos;s{" "}
                <a
                  href="https://www.anthropic.com/legal/aup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#7FAEE6] hover:underline"
                >
                  Acceptable Use Policy
                </a>
                {" "}— illegal content, child sexual abuse material, content designed to harass,
                deceive, or harm.
              </li>
              <li>Reverse-engineer, scrape, or abuse the service.</li>
              <li>Attempt to bypass rate limits, quotas, or billing.</li>
              <li>Use the service to build a competing product without written permission.</li>
            </ul>
            <p>
              Violation of this section may result in immediate account suspension without
              refund.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">5. Subscriptions &amp; credits</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Paid plans renew automatically each billing period until you cancel.</li>
              <li>You can cancel at any time from the Account page; access continues through the end of the paid period.</li>
              <li>Credit packs are non-refundable once purchased.</li>
              <li>Prices may change; we&apos;ll notify you at least 14 days before any increase to your subscription.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">6. Your content</h2>
            <p>
              You retain ownership of the goals, plans, and content you create. You grant YoBoss
              a limited license to store, display, and process that content solely to operate the
              service for you (including sending it to AI providers to generate responses).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">7. AI output</h2>
            <p>
              AI-generated content can be wrong, biased, or outdated. Don&apos;t rely on it for
              medical, legal, financial, or safety-critical decisions without professional
              review. You&apos;re responsible for evaluating AI output before acting on it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">8. Termination</h2>
            <p>
              You can delete your account at any time. We may suspend or terminate accounts that
              violate these Terms or expose us to legal risk.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">9. Disclaimers</h2>
            <p>
              The service is provided &quot;as is&quot; without warranties of any kind. To the maximum
              extent permitted by law, YoBoss is not liable for indirect, incidental, or
              consequential damages. Our total liability for any claim related to the service is
              capped at the amount you paid us in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">10. Changes</h2>
            <p>
              We may update these Terms. Material changes will be announced via email or in-app
              notice at least 14 days before they take effect.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">11. Contact</h2>
            <p>
              Questions about these Terms? Email{" "}
              <a href="mailto:contact@mail.yoboss.ai" className="text-[#7FAEE6] hover:underline">
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
