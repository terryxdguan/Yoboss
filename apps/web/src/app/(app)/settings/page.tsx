import { createClient } from "@/lib/db/server";
import { DailyEmailToggle } from "./email-toggle";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

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
          Settings
        </h1>
        <p className="mt-1 text-sm text-[#6F6A64]">
          Manage your application preferences and configuration
        </p>
      </div>

      <DailyEmailToggle
        initialEnabled={dailyEmailEnabled}
        initialTimezone={timezone}
      />
    </div>
  );
}
