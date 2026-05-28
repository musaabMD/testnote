import "server-only";
import type {
  ConversionEventName,
  ConversionEventProperties,
} from "@/lib/conversion-analytics";

const serverPostHogKey = process.env.POSTHOG_API_KEY;
const serverPostHogHost =
  process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";

function cleanProperties(properties: ConversionEventProperties = {}) {
  const cleaned: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined) cleaned[key] = value;
  }

  return cleaned;
}

export async function captureServerConversionEvent(args: {
  eventName: ConversionEventName;
  distinctId: string;
  properties?: ConversionEventProperties;
}) {
  if (!serverPostHogKey) return;

  try {
    await fetch(`${serverPostHogHost.replace(/\/$/, "")}/capture/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: serverPostHogKey,
        event: args.eventName,
        distinct_id: args.distinctId,
        properties: cleanProperties(args.properties),
      }),
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[conversion] server capture failed:", error);
    }
  }
}

