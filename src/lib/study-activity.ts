export const STUDY_ACTIVITY_KEY = "drnote-study-activity-v1";

function dayKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function touchStudyActivity(at = Date.now()) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STUDY_ACTIVITY_KEY);
    const parsed = raw ? (JSON.parse(raw) as { days?: string[] }) : { days: [] };
    const days = new Set(parsed.days ?? []);
    const key = dayKey(at);
    if (days.has(key)) return;
    days.add(key);
    window.localStorage.setItem(
      STUDY_ACTIVITY_KEY,
      JSON.stringify({ days: [...days].slice(-120) }),
    );
    window.dispatchEvent(new Event("drnote-study-activity"));
  } catch {
    // ignore quota / private browsing
  }
}

export function loadStudyDayKeys(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STUDY_ACTIVITY_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { days?: string[] };
    return new Set(parsed.days ?? []);
  } catch {
    return new Set();
  }
}
