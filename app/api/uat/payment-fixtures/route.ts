import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function gone() {
  return NextResponse.json({ message: "Not found." }, { status: 404 });
}

export async function GET() {
  return gone();
}

export async function POST() {
  return gone();
}
