import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

type AssetRow = {
  file: string;
  bytes: number;
};

const root = process.cwd();
const nextStaticDir = path.join(root, ".next", "static");
const outputPath = path.join(root, ".qa", "performance-baseline.json");

async function pathExists(target: string) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function collectAssets(dir: string): Promise<AssetRow[]> {
  const rows: AssetRow[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rows.push(...(await collectAssets(absolute)));
      continue;
    }

    if (!/\.(js|css)$/i.test(entry.name)) continue;
    const info = await stat(absolute);
    rows.push({
      file: path.relative(root, absolute),
      bytes: info.size,
    });
  }

  return rows;
}

function sumBytes(assets: AssetRow[], extension: ".js" | ".css") {
  return assets
    .filter((asset) => asset.file.endsWith(extension))
    .reduce((sum, asset) => sum + asset.bytes, 0);
}

function largestAssets(assets: AssetRow[], limit = 20) {
  return [...assets].sort((a, b) => b.bytes - a.bytes).slice(0, limit);
}

const packageJson = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const assets = (await pathExists(nextStaticDir))
  ? await collectAssets(nextStaticDir)
  : [];

const baseline = {
  generatedAt: new Date().toISOString(),
  buildOutputFound: assets.length > 0,
  versions: {
    next: packageJson.dependencies?.next,
    react: packageJson.dependencies?.react,
    convex: packageJson.dependencies?.convex,
    vercelAnalytics: packageJson.dependencies?.["@vercel/analytics"],
  },
  bundle: {
    assetCount: assets.length,
    jsBytes: sumBytes(assets, ".js"),
    cssBytes: sumBytes(assets, ".css"),
    largestAssets: largestAssets(assets),
  },
  metricTargets: {
    lcpP75MobileMs: 2500,
    inpP75MobileMs: 200,
    clsP75Mobile: 0.1,
    uploadTimeToQueued10MbP75Ms: 4000,
    uploadTimeToQueued100MbP75Ms: 15000,
    extractionQueueWaitP75Ms: 30000,
    jobPollQueryP75Ms: 150,
    duplicateExtractionRate: 0.01,
  },
  notes: [
    assets.length > 0
      ? "Bundle data is from .next/static."
      : "No .next/static bundle output found. Run npm run build before this report for bundle data.",
    "Upload timing is exposed through the Server-Timing header on POST /api/pdf/mcqs.",
    "Web Vitals reporting is opt-in with NEXT_PUBLIC_ENABLE_WEB_VITALS_REPORTING=true and PERFORMANCE_LOGGING_ENABLED=true.",
  ],
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
console.log(JSON.stringify(baseline, null, 2));
console.log(`\nSaved ${path.relative(root, outputPath)}`);
