import { NextRequest, NextResponse } from "next/server";

const TTS_URL = "https://translate.google.com/translate_tts";

export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get("text")?.trim();
  if (!text || text.length > 500) {
    return new NextResponse("Bad request", { status: 400 });
  }

  try {
    const url = `${TTS_URL}?ie=UTF-8&tl=nl&client=tw-ob&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!res.ok) {
      throw new Error(`Google TTS returned ${res.status}`);
    }

    const buffer = new Uint8Array(await res.arrayBuffer());

    return new NextResponse(buffer, {
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
