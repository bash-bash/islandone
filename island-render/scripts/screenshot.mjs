// Headless screenshot of a running dev/preview server, for visual checks without a GPU.
//
//   npm run build && npx vite preview --port 4173 &
//   node scripts/screenshot.mjs "http://localhost:4173/?renderer=webgl2" shot.png
//
// Uses SwiftShader, so the FPS shown in the HUD is meaningless here.
// CHROMIUM_PATH overrides the browser binary.
import { chromium } from "playwright-core";

const [url = "http://localhost:4173/", out = "screenshot.png"] = process.argv.slice(2);
const webgpu = new URL(url).searchParams.get("renderer") !== "webgl2";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    ...(webgpu ? ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-vulkan=swiftshader", "--use-webgpu-adapter=swiftshader"] : []),
  ],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
page.on("console", (m) => m.type() === "error" && console.error("[console]", m.text()));
await page.goto(url);
await page.waitForFunction(() => !document.querySelector(".hud-loading"), null, { timeout: 180_000 });
await page.waitForTimeout(5000);
await page.screenshot({ path: out, timeout: 180_000 }); // software WebGPU can take a while per frame
console.log(((await page.locator(".hud-stats").textContent()) ?? "").replace(/\s+/g, " ")); // hidden unless ?debug
await browser.close();
