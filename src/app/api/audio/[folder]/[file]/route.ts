import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ folder: string; file: string }> }
) {
  const { folder, file } = await params;

  // Sanitize — allow only safe path components
  if (!/^NED_L\dU\d{2}$/.test(folder) || !/^[\w\s\-\.]+\.mp3$/i.test(file)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const audioPath = path.join(process.cwd(), "public", "audio", folder, file);

  if (!fs.existsSync(audioPath)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const stat = fs.statSync(audioPath);
  const stream = fs.createReadStream(audioPath);
  const body = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => controller.enqueue(chunk));
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": stat.size.toString(),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
