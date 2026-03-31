#!/usr/bin/env node
import { chromium } from 'playwright-core';

const gostUrl = process.env.GOST_URL;

(async () => {
  let browser = null;
  let context = null;
  let page = null;
  try {
    const browserOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors', '--disable-web-security', '--disable-features=VizDisplayCompositor'],
      defaultViewport: { width: 1280, height: 720 },
    };

    if (gostUrl) {
      // Parse proxy URL - Playwright needs credentials separately
      const proxyUrl = new URL(gostUrl);
      browserOptions.proxy = {
        server: `${proxyUrl.protocol}//${proxyUrl.hostname}:${proxyUrl.port}`,
        username: proxyUrl.username,
        password: proxyUrl.password,
      };
    }

    browser = await chromium.launch(browserOptions);
    context = await browser.newContext();
    page = await context.newPage();

    const m3u8Promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for m3u8")), 45000);
      page.on('request', (request) => {
        const url = request.url();
        if (url.includes('playlist.m3u8') && url.includes('?r=')) {
          clearTimeout(timeout);
          resolve(url);
        }
      });
    });

    await page.goto('https://www.881903.com/live/903', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    const selector = '.player__overlay, .v-icon.play, .player-section__player-box i';
    await page.waitForSelector(selector, { state: 'attached', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.click(selector, { force: true });

    const m3u8Link = await m3u8Promise;

    console.log(m3u8Link);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    // Cleanup in reverse order: page -> context -> browser
    try { if (page) await page.close(); } catch {}
    try { if (context) await context.close(); } catch {}
    try { if (browser?.isConnected()) await browser.close(); } catch {}
    process.exit(0);
  }
})();
