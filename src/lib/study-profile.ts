export type StudyProfile = {
  examGoal: string;
  examSlug?: string;
  examName?: string;
  examDate: string;
  hoursPerWeek: string;
  level: "beginner" | "intermediate" | "advanced" | "";
  preferredFormats: string[];
  primaryGoal: string;
  updatedAt: string;
};

export const STUDY_PROFILE_KEY = "drnote-study-profile";

export const DEFAULT_STUDY_PROFILE: StudyProfile = {
  examGoal: "",
  examSlug: "",
  examName: "",
  examDate: "",
  hoursPerWeek: "",
  level: "",
  preferredFormats: [],
  primaryGoal: "",
  updatedAt: "",
};

export function loadStudyProfile(): StudyProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STUDY_PROFILE_KEY);
    if (!raw) return null;
    return { ...DEFAULT_STUDY_PROFILE, ...JSON.parse(raw) } as StudyProfile;
  } catch {
    return null;
  }
}

export function saveStudyProfile(profile: StudyProfile) {
  if (typeof window === "undefined") return;
  const payload: StudyProfile = {
    ...profile,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STUDY_PROFILE_KEY, JSON.stringify(payload));
}

export function isStudyProfileComplete(profile: StudyProfile | null) {
  if (!profile) return false;
  return Boolean(profile.examGoal.trim());
}
