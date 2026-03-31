#!/usr/bin/env node
// 881903 Recorder - Run directly on OpenWrt router
// Requires: Node.js 18+, Playwright Core, Chromium

import { chromium } from "playwright-core";
import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============== CONFIGURATION ==============
const LIVE_URL = "https://www.881903.com/live/903";
const OUTPUT_DIR = "/path/to/your/output";  // Change this to your desired output directory
const DURATION = "7200"; // Recording duration in seconds (7200 = 2 hours)
const REFERER = "https://www.881903.com/live/903";
// ===========================================

async function fetchStreamUrl() {
  let browser = null;
  let context = null;
  let page = null;
  try {
    const browserOptions = {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
    };

    browser = await chromium.launch(browserOptions);
    context = await browser.newContext();
    page = await context.newPage();

    // Capture m3u8 from network (wait for playlist.m3u8 with ?r= parameter)
    const m3u8Promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for m3u8")), 45000);
      page.on("request", (request) => {
        const url = request.url();
        if (url.includes("playlist.m3u8") && url.includes("?r=")) {
          clearTimeout(timeout);
          resolve(url);
        }
      });
    });

    await page.goto(LIVE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    // Wait for play button and click it
    const selector = '.player__overlay, .v-icon.play, .player-section__player-box i';
    await page.waitForSelector(selector, { state: 'attached', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.click(selector, { force: true });

    const m3u8Url = await m3u8Promise;
    return m3u8Url;
  } finally {
    // Cleanup in reverse order: page -> context -> browser
    try { if (page) await page.close(); } catch {}
    try { if (context) await context.close(); } catch {}
    try { if (browser?.isConnected()) await browser.close(); } catch {}
  }
}

async function recordStream(url) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "_");
  const outputFile = join(OUTPUT_DIR, `recording_${date}.mp4`);

  // Ensure output directory exists
  await new Promise((resolve) => {
    const mkdir = spawn("mkdir", ["-p", OUTPUT_DIR]);
    mkdir.on("close", resolve);
  });

  console.log(`Recording to: ${outputFile}`);

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-user_agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "-headers", `Referer: ${REFERER}`,
      "-i", url,
      "-c", "copy",
      "-t", DURATION,
      outputFile
    ]);

    ffmpeg.stderr.on("data", (data) => {
      const line = data.toString();
      if (line.includes("frame=") || line.includes("time=")) {
        process.stdout.write(`\r${line.trim()}`);
      }
    });

    ffmpeg.on("close", (code) => {
      console.log();
      if (code === 0) {
        console.log(`Recording completed: ${outputFile}`);
        resolve(outputFile);
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on("error", (err) => {
      reject(err);
    });
  });
}

// Main
async function main() {
  console.log("Fetching stream URL...");
  const url = await fetchStreamUrl();
  console.log(`Got URL: ${url.substring(0, 60)}...`);

  console.log("Starting recording...");
  await recordStream(url);
  console.log("Done!");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
