import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

const examCategory = v.union(
  v.literal("Medical"),
  v.literal("Dental"),
  v.literal("Legal"),
  v.literal("Language"),
  v.literal("Pharmacy"),
  v.literal("Nursing"),
  v.literal("Laboratory"),
  v.literal("Radiology"),
);

export const examCatalogRecord = v.object({
  slug: v.string(),
  name: v.string(),
  country: v.string(),
  countryName: v.string(),
  category: examCategory,
  description: v.string(),
  details: v.string(),
  fileCount: v.number(),
  sortOrder: v.number(),
});

type ExamSeed = {
  slug: string;
  name: string;
  country: string;
  countryName: string;
  category:
    | "Medical"
    | "Dental"
    | "Legal"
    | "Language"
    | "Pharmacy"
    | "Nursing"
    | "Laboratory"
    | "Radiology";
  description: string;
  details: string;
  fileCount?: number;
  sortOrder: number;
};

const SAUDI_EXAMS: ExamSeed[] = [
  {
    slug: "smle",
    name: "SMLE",
    country: "🇸🇦",
    countryName: "Saudi Arabia",
    category: "Medical",
    description: "Saudi Medical Licensing Examination",
    details:
      "SMLE is the comprehensive licensing examination for physicians seeking to practice medicine in Saudi Arabia under the Saudi Commission for Health Specialties (SCFHS).",
    sortOrder: 10,
  },
  {
    slug: "family-medicine",
    name: "Family Medicine",
    country: "🇸🇦",
    countryName: "Saudi Arabia",
    category: "Medical",
    description: "Saudi Family Medicine Licensing Examination",
    details:
      "The Saudi Family Medicine exam assesses clinical knowledge and decision-making for primary care physicians seeking SCFHS licensure in family medicine.",
    sortOrder: 20,
  },
  {
    slug: "sdle",
    name: "SDLE",
    country: "🇸🇦",
    countryName: "Saudi Arabia",
    category: "Dental",
    description: "Saudi Dental Licensing Examination",
    details:
      "SDLE is the licensing examination for dental professionals seeking to practice dentistry in Saudi Arabia under SCFHS.",
    sortOrder: 30,
  },
  {
    slug: "sple",
    name: "SPLE",
    country: "🇸🇦",
    countryName: "Saudi Arabia",
    category: "Pharmacy",
    description: "Saudi Pharmacy Licensing Examination",
    details:
      "SPLE is the licensing examination for pharmacists seeking to practice pharmacy in Saudi Arabia under SCFHS.",
    sortOrder: 40,
  },
  {
    slug: "snle",
    name: "SNLE",
    country: "🇸🇦",
    countryName: "Saudi Arabia",
    category: "Nursing",
    description: "Saudi Nursing Licensing Examination",
    details:
      "SNLE is the licensing examination for nursing professionals seeking to practice nursing in Saudi Arabia under SCFHS.",
    sortOrder: 50,
  },
  {
    slug: "slle",
    name: "SLLE",
    country: "🇸🇦",
    countryName: "Saudi Arabia",
    category: "Laboratory",
    description: "Saudi Laboratory Licensing Examination",
    details:
      "SLLE is the licensing examination for medical laboratory professionals seeking to practice in Saudi Arabia under SCFHS.",
    sortOrder: 60,
  },
  {
    slug: "radiology",
    name: "Radiology",
    country: "🇸🇦",
    countryName: "Saudi Arabia",
    category: "Radiology",
    description: "Saudi Radiology Licensing Examination",
    details:
      "The Saudi Radiology licensing exam assesses imaging knowledge and clinical interpretation skills for radiologists seeking SCFHS licensure.",
    sortOrder: 70,
  },
  {
    slug: "saudi-prometric",
    name: "Saudi Prometric",
    country: "🇸🇦",
    countryName: "Saudi Arabia",
    category: "Medical",
    description: "Saudi Commission for Health Specialties Prometric Exams",
    details:
      "Saudi Prometric exams are conducted by SCFHS for healthcare professionals wishing to practice in Saudi Arabia across multiple specialties.",
    sortOrder: 80,
  },
];

function mapExamRow(row: {
  slug: string;
  name: string;
  country: string;
  countryName: string;
  category: ExamSeed["category"];
  description: string;
  details: string;
  fileCount: number;
  sortOrder: number;
}) {
  return {
    slug: row.slug,
    name: row.name,
    country: row.country,
    countryName: row.countryName,
    category: row.category,
    description: row.description,
    details: row.details,
    fileCount: row.fileCount,
    sortOrder: row.sortOrder,
  };
}

export const listCatalog = query({
  args: {
    countryName: v.optional(v.string()),
    withFilesOnly: v.optional(v.boolean()),
  },
  returns: v.array(examCatalogRecord),
  handler: async (ctx, args) => {
    let rows = await ctx.db
      .query("examCatalog")
      .withIndex("by_active_sort", (q) => q.eq("isActive", true))
      .collect();

    if (args.countryName) {
      rows = rows.filter((row) => row.countryName === args.countryName);
    }

    if (args.withFilesOnly) {
      rows = rows.filter((row) => row.fileCount > 0);
    }

    return rows
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map(mapExamRow);
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(examCatalogRecord, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("examCatalog")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!row || !row.isActive) return null;
    return mapExamRow(row);
  },
});

export const seedSaudiExamCatalog = internalMutation({
  args: {},
  returns: v.object({
    inserted: v.number(),
    updated: v.number(),
    total: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;

    for (const exam of SAUDI_EXAMS) {
      const existing = await ctx.db
        .query("examCatalog")
        .withIndex("by_slug", (q) => q.eq("slug", exam.slug))
        .first();

      const payload = {
        slug: exam.slug,
        name: exam.name,
        country: exam.country,
        countryName: exam.countryName,
        category: exam.category,
        description: exam.description,
        details: exam.details,
        fileCount: exam.fileCount ?? 0,
        sortOrder: exam.sortOrder,
        isActive: true,
        updatedAt: now,
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
        updated += 1;
      } else {
        await ctx.db.insert("examCatalog", {
          ...payload,
          createdAt: now,
        });
        inserted += 1;
      }
    }

    return {
      inserted,
      updated,
      total: SAUDI_EXAMS.length,
    };
  },
});
