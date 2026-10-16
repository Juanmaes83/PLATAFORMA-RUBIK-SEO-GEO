export type Keyword = {
  id: string; phrase: string; language_code: string; country_code: string;
  intent: string; topic: string; target_url: string | null; created_at: string;
};

export const INTENTS = ["unknown", "informational", "navigational", "commercial", "transactional"] as const;

export function normalizeKeyword(raw: { phrase: string; language: string; country: string; intent: string; topic: string; targetUrl: string }, domain: string | null) {
  const phrase = raw.phrase.trim().replace(/\s+/g, " ");
  const language_code = raw.language.trim().toLowerCase();
  const country_code = raw.country.trim().toUpperCase();
  const topic = raw.topic.trim();
  const intent = INTENTS.includes(raw.intent as typeof INTENTS[number]) ? raw.intent : "unknown";
  if (phrase.length < 2 || phrase.length > 160 || !/^[a-z]{2}(-[a-z]{2})?$/.test(language_code) || !/^[A-Z]{2}$/.test(country_code) || topic.length > 80) return null;
  let target_url: string | null = null;
  if (raw.targetUrl.trim()) {
    try {
      const url = new URL(raw.targetUrl.trim());
      const host = (domain ?? "").replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
      if (url.protocol !== "https:" || url.username || url.password || !host || url.hostname.toLowerCase() !== host || url.href.length > 2048) return null;
      url.hash = "";
      target_url = url.href;
    } catch { return null; }
  }
  return { phrase, language_code, country_code, intent, topic, target_url };
}

/** Possible cannibalization: same phrase/market declared against more than one page. */
export function keywordOverlaps(rows: Keyword[]): string[] {
  const targets = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.target_url) continue;
    const key = `${row.phrase.toLocaleLowerCase()}|${row.language_code}|${row.country_code}`;
    const urls = targets.get(key) ?? new Set<string>();
    urls.add(row.target_url);
    targets.set(key, urls);
  }
  return [...targets].filter(([, urls]) => urls.size > 1).map(([key]) => key.split("|")[0]);
}
