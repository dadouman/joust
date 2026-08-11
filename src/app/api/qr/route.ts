import { NextRequest } from "next/server";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url");
  if (!target || target.length > 400) {
    return Response.json({ error: "url manquante." }, { status: 400 });
  }

  try {
    const svg = await QRCode.toString(target, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
      color: { dark: "#0d0b16", light: "#ffffff" },
    });

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return Response.json({ error: "QR indisponible." }, { status: 500 });
  }
}
