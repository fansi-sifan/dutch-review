import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";

const CACHE_DIR = path.join(process.cwd(), ".tts-cache");
const TTS_URL = "https://translate.google.com/translate_tts";

function getCachePath(text: string): string {
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 16);
  return path.join(CACHE_DIR, `${hash}.mp3`);
}

export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get("text")?.trim();
  if (!text || text.length > 500) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const cachePath = getCachePath(text);

  if (fs.existsSync(cachePath)) {
    const buf = fs.readFileSync(cachePath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  }

  try {
    const url = `${TTS_URL}?ie=UTF-8&tl=nl&client=tw-ob&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!res.ok) {
      throw new Error(`Google TTS returned ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(cachePath, buffer);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch (e) {
    console.error("TTS error:", e);
    return new NextResponse("TTS generation failed", { status: 500 });
  }
}
