import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/db/server";
import { DailyEmailToggle } from "./email-toggle";
import { LanguageSwitcher } from "@/components/common/language-switcher";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const t = await getTranslations("settings");

  let dailyEmailEnabled = true;
  let timezone = "UTC";
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("daily_email_enabled, timezone")
      .eq("id", user.id)
      .maybeSingle();
    if (data && typeof data.daily_email_enabled === "boolean") {
      dailyEmailEnabled = data.daily_email_enabled;
    }
    if (data?.timezone) timezone = data.timezone;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight text-[#2B2B2B]">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-[#6F6A64]">
          {t("subtitle")}
        </p>
      </div>

      <section className="bg-white border border-[#E7DED2] rounded-2xl p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-base font-semibold text-[#2B2B2B]">
              {t("language.title")}
            </h2>
            <p className="mt-1 text-sm text-[#6F6A64]">
              {t("language.description")}
            </p>
          </div>
          <LanguageSwitcher variant="row" />
        </div>
      </section>

      <DailyEmailToggle
        initialEnabled={dailyEmailEnabled}
        initialTimezone={timezone}
      />
    </div>
  );
}
