export type ExamCategory =
  | "Medical"
  | "Dental"
  | "Legal"
  | "Language"
  | "Pharmacy"
  | "Nursing"
  | "Laboratory"
  | "Radiology";

export type Exam = {
  slug: string;
  name: string;
  country: string;
  countryName: string;
  category: ExamCategory;
  description: string;
  details: string;
  fileCount: number;
  sortOrder: number;
};

export function examHasFiles(exam: Exam): boolean {
  return exam.fileCount > 0;
}

export function examsWithFiles(exams: Exam[]): Exam[] {
  return exams.filter(examHasFiles);
}

export function examCategoriesFrom(exams: Exam[]): ExamCategory[] {
  return Array.from(new Set(exams.map((exam) => exam.category))).sort() as ExamCategory[];
}

export const CATEGORY_COLORS: Record<ExamCategory, string> = {
  Medical: "bg-blue-100 text-blue-800 border-blue-200",
  Dental: "bg-green-100 text-green-800 border-green-200",
  Legal: "bg-purple-100 text-purple-800 border-purple-200",
  Language: "bg-orange-100 text-orange-800 border-orange-200",
  Pharmacy: "bg-cyan-100 text-cyan-800 border-cyan-200",
  Nursing: "bg-pink-100 text-pink-800 border-pink-200",
  Laboratory: "bg-amber-100 text-amber-800 border-amber-200",
  Radiology: "bg-indigo-100 text-indigo-800 border-indigo-200",
};

export function getExamBySlug(exams: Exam[], slug: string): Exam | undefined {
  return exams.find((exam) => exam.slug === slug);
}
