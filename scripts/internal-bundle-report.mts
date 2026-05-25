import { readdir, stat } from "node:fs/promises";
import path from "node:path";

type AssetRow = {
  file: string;
  bytes: number;
};

const root = process.cwd();
const staticDir = path.join(root, ".next", "static");
const maxRows = Number.parseInt(process.env.BUNDLE_REPORT_LIMIT ?? "20", 10);

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

try {
  const assets = await collectAssets(staticDir);
  const jsBytes = assets
    .filter((asset) => asset.file.endsWith(".js"))
    .reduce((sum, asset) => sum + asset.bytes, 0);
  const cssBytes = assets
    .filter((asset) => asset.file.endsWith(".css"))
    .reduce((sum, asset) => sum + asset.bytes, 0);

  console.log("Bundle report from .next/static");
  console.log(`JS total: ${formatBytes(jsBytes)}`);
  console.log(`CSS total: ${formatBytes(cssBytes)}`);
  console.log(`Asset count: ${assets.length}`);
  console.log("");
  console.log(`Largest ${Math.min(maxRows, assets.length)} JS/CSS assets:`);

  assets
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, Number.isFinite(maxRows) && maxRows > 0 ? maxRows : 20)
    .forEach((asset, index) => {
      console.log(
        `${String(index + 1).padStart(2, " ")}. ${formatBytes(asset.bytes).padStart(9, " ")}  ${asset.file}`,
      );
    });
} catch (error) {
  console.error(
    "Bundle report requires a completed production build. Run `npm run build` first.",
  );
  if (process.env.NODE_ENV === "development") console.error(error);
  process.exitCode = 1;
}
