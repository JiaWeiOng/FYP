
const ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find";
const TIMEOUT_MS = 5000;

export async function checkSafeBrowsing(url) {
  const key = process.env.EXPO_PUBLIC_GSB_API_KEY;
  console.log("[GSB] checkSafeBrowsing() called | url:", url, "| key set:", !!key);
  if (!key || !url) {
    console.log("[GSB] -> skipped: no API key (is EXPO_PUBLIC_GSB_API_KEY in .env.local and did you restart with `expo start -c`?) or empty url");
    return false;
  }

  // GSB wants a full URL; add a scheme if the user typed a bare host.
  const fullUrl = /^https?:\/\//i.test(url) ? url : "http://" + url;

  const body = {
    client: { clientId: "universal-secure-qr-detector", clientVersion: "1.0.0" },
    threatInfo: {
      threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
      platformTypes: ["ANY_PLATFORM"],
      threatEntryTypes: ["URL"],
      threatEntries: [{ url: fullUrl }],
    },
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    console.log("[GSB] HTTP status:", res.status);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.log("[GSB] -> request FAILED (bad/unrestricted key, API not enabled, or quota). Body:", errText.slice(0, 300));
      return false;
    }
    const data = await res.json();
    const flagged = Array.isArray(data?.matches) && data.matches.length > 0;
    console.log("[GSB] -> result:", flagged ? `FLAGGED (${data.matches.length} match)` : "clean (Google has no record of this URL)");
    return flagged;
  } catch (e) {
    console.log("[GSB] -> error (offline / timeout / parse):", e?.message ?? String(e));
    return false;
  }
}
