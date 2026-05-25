import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const outputDir = path.join(repoRoot, "docs", "media");
const framesDir = path.join(outputDir, "feature-snapshot-frames");
const mp4Path = path.join(outputDir, "drnote-feature-snapshot.mp4");
const gifPath = path.join(outputDir, "drnote-feature-snapshot.gif");
const url = process.argv[2] ?? "http://127.0.0.1:3000/feature-snapshot";
const chromePath =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.CHROME_REMOTE_DEBUGGING_PORT ?? 9223);
const width = Number(process.env.CAPTURE_WIDTH ?? 1280);
const height = Number(process.env.CAPTURE_HEIGHT ?? 720);
const fps = Number(process.env.CAPTURE_FPS ?? 12);
const slideSeconds = Number(process.env.CAPTURE_SLIDE_SECONDS ?? 2.4);
const framesPerSlide = Math.round(fps * slideSeconds);
const slides = ["upload", "flashcards", "quiz", "exam", "summary", "ask"];

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: options.stdio ?? "pipe",
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${code}\n${stderr}`));
    });
  });
}

async function waitForJsonEndpoint(endpoint, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) return response.json();
    } catch {
      // Chrome may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${endpoint}`);
}

class CdpSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(payload);
    });
  }
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  const profileDir = await mkdtemp(path.join(tmpdir(), "drnote-capture-"));
  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      "--hide-scrollbars",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    const { webSocketDebuggerUrl } = await waitForJsonEndpoint(
      `http://127.0.0.1:${port}/json/version`,
    );

    const socket = new WebSocket(webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });

    const cdp = new CdpSession(socket);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });

    const send = (method, params = {}) => cdp.send(method, params, sessionId);

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    let frameIndex = 0;
    for (const slide of slides) {
      const slideUrl = new URL(url);
      slideUrl.searchParams.set("slide", slide);
      await send("Page.navigate", { url: slideUrl.toString() });
      await new Promise((resolve) => setTimeout(resolve, 700));

      for (let index = 0; index < framesPerSlide; index += 1) {
        const { data } = await send("Page.captureScreenshot", {
          format: "png",
          fromSurface: true,
        });
        const frameName = `frame-${String(frameIndex).padStart(4, "0")}.png`;
        await writeFile(path.join(framesDir, frameName), Buffer.from(data, "base64"));
        frameIndex += 1;
        await new Promise((resolve) => setTimeout(resolve, 1000 / fps));
      }
    }

    socket.close();
  } finally {
    chrome.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => chrome.once("close", resolve)),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }

  await run("ffmpeg", [
    "-y",
    "-framerate",
    String(fps),
    "-i",
    path.join(framesDir, "frame-%04d.png"),
    "-vf",
    "format=yuv420p",
    "-movflags",
    "+faststart",
    mp4Path,
  ]);

  await run("ffmpeg", [
    "-y",
    "-i",
    mp4Path,
    "-vf",
    "fps=10,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
    "-loop",
    "0",
    gifPath,
  ]);

  console.log(`MP4: ${mp4Path}`);
  console.log(`GIF: ${gifPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
