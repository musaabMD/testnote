export type ExamCategory = "Medical" | "Dental" | "Legal" | "Language";

export type Exam = {
  id: number;
  name: string;
  slug: string;
  country: string;
  countryName: string;
  category: ExamCategory;
  description: string;
  details: string;
  fileCount: number;
};

export const EXAMS: Exam[] = [
  {
    id: 1,
    name: "USMLE",
    slug: "usmle",
    country: "🇺🇸",
    countryName: "United States",
    category: "Medical",
    description: "United States Medical Licensing Examination",
    details:
      "The USMLE is a three-step examination for medical licensure in the United States. It assesses a physician's ability to apply knowledge, concepts, and principles that are important in health and disease.",
    fileCount: 24,
  },
  {
    id: 2,
    name: "PLAB",
    slug: "plab",
    country: "🇬🇧",
    countryName: "United Kingdom",
    category: "Medical",
    description: "Professional and Linguistic Assessments Board",
    details:
      "PLAB is the main route by which International Medical Graduates demonstrate that they have the necessary skills and knowledge to practice medicine in the UK.",
    fileCount: 18,
  },
  {
    id: 3,
    name: "AMC",
    slug: "amc",
    country: "🇦🇺",
    countryName: "Australia",
    category: "Medical",
    description: "Australian Medical Council",
    details:
      "The AMC is responsible for the assessment and recognition of medical qualifications for international medical graduates seeking to practice in Australia.",
    fileCount: 15,
  },
  {
    id: 4,
    name: "MCCQE",
    slug: "mccqe",
    country: "🇨🇦",
    countryName: "Canada",
    category: "Medical",
    description: "Medical Council of Canada Qualifying Examination",
    details:
      "The MCCQE Part I is a one-day, computer-based test that assesses the critical medical knowledge and clinical decision-making ability of a candidate at the level expected of a medical student who is completing their medical degree.",
    fileCount: 12,
  },
  {
    id: 5,
    name: "FMGE",
    slug: "fmge",
    country: "🇮🇳",
    countryName: "India",
    category: "Medical",
    description: "Foreign Medical Graduate Examination",
    details:
      "FMGE is a licensure examination conducted by the National Board of Examinations (NBE) for Indian citizens who have obtained their medical qualifications from outside India.",
    fileCount: 9,
  },
  {
    id: 6,
    name: "DHA",
    slug: "dha",
    country: "🇦🇪",
    countryName: "UAE",
    category: "Medical",
    description: "Dubai Health Authority",
    details:
      "The DHA exam is required for healthcare professionals seeking to practice in Dubai, UAE. It assesses medical knowledge and clinical skills.",
    fileCount: 11,
  },
  {
    id: 7,
    name: "Saudi Prometric",
    slug: "saudi-prometric",
    country: "🇸🇦",
    countryName: "Saudi Arabia",
    category: "Medical",
    description: "Saudi Commission for Health Specialties",
    details:
      "The Saudi Prometric exam is conducted by the Saudi Commission for Health Specialties (SCFHS) for healthcare professionals wishing to practice in Saudi Arabia.",
    fileCount: 14,
  },
  {
    id: 8,
    name: "OET",
    slug: "oet",
    country: "🌍",
    countryName: "International",
    category: "Language",
    description: "Occupational English Test",
    details:
      "OET is an international English language test that assesses the language communication skills of healthcare professionals who seek to register and practice in an English-speaking environment.",
    fileCount: 8,
  },
  {
    id: 9,
    name: "IELTS",
    slug: "ielts",
    country: "🌍",
    countryName: "International",
    category: "Language",
    description: "International English Language Testing System",
    details:
      "IELTS is an international standardized test of English language proficiency for non-native English language speakers. It is widely accepted for medical registration purposes.",
    fileCount: 6,
  },
  {
    id: 10,
    name: "Bar Exam",
    slug: "bar-exam",
    country: "🇺🇸",
    countryName: "United States",
    category: "Legal",
    description: "Bar Examination for Legal Practice",
    details:
      "The Bar Exam is a professional examination that lawyers must pass to be admitted to practice law in a particular jurisdiction.",
    fileCount: 10,
  },
  {
    id: 11,
    name: "SMLE",
    slug: "smle",
    country: "🇸🇦",
    countryName: "Saudi Arabia",
    category: "Medical",
    description: "Saudi Medical Licensing Examination",
    details:
      "SMLE is a comprehensive examination for medical professionals seeking to practice medicine in Saudi Arabia.",
    fileCount: 13,
  },
  {
    id: 12,
    name: "SDLE",
    slug: "sdle",
    country: "🇸🇦",
    countryName: "Saudi Arabia",
    category: "Dental",
    description: "Saudi Dental Licensing Examination",
    details:
      "SDLE is a comprehensive examination for dental professionals seeking to practice dentistry in Saudi Arabia.",
    fileCount: 7,
  },
];

export const EXAM_CATEGORIES = Array.from(
  new Set(EXAMS.map((exam) => exam.category)),
).sort() as ExamCategory[];

export const CATEGORY_COLORS: Record<ExamCategory, string> = {
  Medical: "bg-blue-100 text-blue-800 border-blue-200",
  Dental: "bg-green-100 text-green-800 border-green-200",
  Legal: "bg-purple-100 text-purple-800 border-purple-200",
  Language: "bg-orange-100 text-orange-800 border-orange-200",
};

export function getExamBySlug(slug: string): Exam | undefined {
  return EXAMS.find((exam) => exam.slug === slug);
}
