import { chromium as pwChromium } from "playwright-core";
import sparticuzChromium from "@sparticuz/chromium";

const LIVE_URL = "https://www.881903.com/live/903";

const fetchStreamUrl = async () => {
  let browser = null;
  let page = null;
  let context = null;
  try {
    const gostUrl = process.env.GOST_URL;
    if (!gostUrl) {
      throw new Error("GOST_URL environment variable is not set");
    }

    // Parse proxy URL - Playwright needs credentials separately
    const proxyUrl = new URL(gostUrl);
    const proxyConfig = {
      server: `${proxyUrl.protocol}//${proxyUrl.hostname}:${proxyUrl.port}`,
      username: proxyUrl.username,
      password: proxyUrl.password,
    };

    browser = await pwChromium.launch({
      args: [...sparticuzChromium.args, "--ignore-certificate-errors", "--disable-web-security", "--disable-features=VizDisplayCompositor"],
      defaultViewport: { width: 1280, height: 720 },
      executablePath: await sparticuzChromium.executablePath(),
      headless: sparticuzChromium.headless,
      ignoreHTTPSErrors: true,
      proxy: proxyConfig,
    });

    context = await browser.newContext();
    page = await context.newPage();

    // Capture m3u8 from network (wait for playlist.m3u8 with ?r= parameter)
    let m3u8Url = null;
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

    m3u8Url = await m3u8Promise;
    return m3u8Url;
  } finally {
    // Cleanup in reverse order: page -> context -> browser
    try { if (page) await page.close(); } catch {}
    try { if (context) await context.close(); } catch {}
    try { if (browser?.isConnected()) await browser.close(); } catch {}
  }
};

type VercelRequest = {
  method?: string;
  url?: string;
  headers?: Record<string, string | undefined>;
};

type VercelResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const providedKey = url.searchParams.get("key");
  const apiKey = process.env.API_KEY;

  if (apiKey && providedKey !== apiKey) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "text/plain");
    res.end("Unauthorized");
    return;
  }

  try {
    const streamUrl = await fetchStreamUrl();
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.end(streamUrl);
  } catch (error: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(error.message);
  }
}
