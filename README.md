# 881903 Live Stream URL Extractor

Extracts m3u8 stream URLs from 881903.com (Hong Kong Commercial Radio) for recording.

## Deployment: Vercel Serverless Function

Deploy to Vercel (HK region) to extract stream URLs. The function uses headless Chromium to:
1. Load the 881903 live page
2. Click the play button
3. Capture the m3u8 stream URL
4. Return it for recording

### Setup

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Link project
vercel link

# Set environment variables
vercel env add API_KEY        # Your secret key for authentication
vercel env add GOST_URL       # Proxy URL: https://user:pass@hostname:port

# Deploy
vercel --prod
```

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `API_KEY` | Secret key to access the endpoint | `your_secret_key_here` |
| `GOST_URL` | HTTPS proxy URL with credentials | `https://user:pass@host:port` |

**Why GOST_URL?**

The 881903 stream URLs are IP-bound. The GOST proxy must run on the **same network** as your recorder (e.g., your home network). This ensures:
- The Vercel function routes traffic through your home proxy
- The stream URL is bound to your home IP address
- The recorded stream works when played back from your network

**Setup GOST proxy on your network:**
1. Install GOST on a machine in your home network
2. Configure it to accept connections from Vercel
3. Set `GOST_URL` to point to your proxy (use DDNS if no static IP)

**Generate API_KEY:**
```bash
openssl rand -hex 32
```

### Usage

```bash
# Get stream URL
curl "https://your-project.vercel.app?key=YOUR_API_KEY"

# Record with ffmpeg
STREAM_URL=$(curl "https://your-project.vercel.app?key=YOUR_API_KEY")
ffmpeg -y \
    -user_agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
    -headers "Referer: https://www.881903.com/live/903" \
    -i "$STREAM_URL" \
    -c copy \
    output.mp4
```

### Recording Script

```bash
#!/bin/bash
# record_show.sh

API_URL="https://your-project.vercel.app"
API_KEY="YOUR_API_KEY"
OUTPUT_DIR="./recordings"
DATE=$(date +%Y_%m_%d)

# Get stream URL
STREAM_URL=$(curl "$API_URL?key=$API_KEY")
if [ $? -ne 0 ] || [ -z "$STREAM_URL" ]; then
    echo "Failed to get stream URL"
    exit 1
fi

echo "Recording to: $OUTPUT_DIR/recording_$DATE.mp4"
ffmpeg -y \
    -user_agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
    -headers "Referer: https://www.881903.com/live/903" \
    -i "$STREAM_URL" \
    -c copy \
    "$OUTPUT_DIR/recording_$DATE.mp4"
```

### Cron Example

```bash
# Edit crontab
crontab -e

# Add job (example: daily at 23:00)
0 23 * * * /path/to/record_show.sh >> /tmp/recorder.log 2>&1
```

## Alternative: Run Directly on OpenWrt Router

Run the recorder directly on your OpenWrt router. No proxy needed since it's on your home network.

**Requirements:**
- Node.js 18+ on OpenWrt
- Playwright Core
- Chromium browser
- ffmpeg
- ~200MB RAM

**Setup:**

```bash
# SSH into router
ssh root@your-router

# Install Node.js (via entware)
opkg update
opkg install nodejs18

# Install dependencies
npm install -g playwright-core
playwright install chromium

# Install ffmpeg
opkg install ffmpeg

# Download recorder
cd /root
curl -O https://raw.githubusercontent.com/lam2lam/881903-live-url/main/openwrt-recorder.mjs
chmod +x openwrt-recorder.mjs

# Edit OUTPUT_DIR in the script
vi openwrt-recorder.mjs  # Change /path/to/your/output to your path

# Test run
node openwrt-recorder.mjs

# Add cron (example: Saturday 23:00)
echo "0 23 * * 6 cd /root && node openwrt-recorder.mjs >> /tmp/recorder.log 2>&1" >> /etc/crontabs/root
/etc/init.d/cron restart
```

**Compare: Vercel vs OpenWrt**

| Method | Pros | Cons |
|--------|------|------|
| **Vercel** | No local setup, auto-scales | Needs GOST proxy, 60s timeout |
| **OpenWrt** | Direct access, no proxy, longer recordings | Requires router resources, manual setup |

## Local Testing

```bash
# Install dependencies
npm install

# Set environment variable (optional, for proxy testing)
export GOST_URL="https://user:pass@hostname:port"

# Run test
node test-vercel-local.mjs
```

## Stack

- **Runtime:** Vercel Serverless Functions (Node.js)
- **Browser:** Playwright Core + @sparticuz/chromium (Vercel-optimized)
- **Region:** HKG1 (Hong Kong)
- **Max Duration:** 60 seconds

## Notes

- Stream URLs may be IP-bound; using a proxy helps if accessing from different IPs
- The proxy uses HTTPS with self-signed certificates; `--ignore-certificate-errors` is enabled
- Memory is cleaned up after each request to prevent accumulation
- Free tier: 1024MB memory, 60s max duration
