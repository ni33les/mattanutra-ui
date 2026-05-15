import { NextResponse } from "next/server";

const maxQrDataLength = 2048;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const data = searchParams.get("data")?.trim();

  if (!data) {
    return NextResponse.json({ error: "Missing QR data" }, { status: 400 });
  }

  if (data.length > maxQrDataLength) {
    return NextResponse.json({ error: "QR data is too long" }, { status: 400 });
  }

  const qrUrl = new URL("https://api.qrserver.com/v1/create-qr-code/");
  qrUrl.searchParams.set("size", "176x176");
  qrUrl.searchParams.set("margin", "10");
  qrUrl.searchParams.set("data", data);

  const response = await fetch(qrUrl, { next: { revalidate: 86400 } });

  if (!response.ok) {
    return NextResponse.json(
      { error: "QR code could not be generated" },
      { status: 502 }
    );
  }

  return new NextResponse(await response.arrayBuffer(), {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Content-Type": response.headers.get("content-type") || "image/png"
    }
  });
}
