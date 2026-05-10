import { NextResponse } from "next/server";
import { cancelReassessmentActionByToken } from "@/lib/task-worker";

export const runtime = "nodejs";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function unsubscribePage({
  body,
  title
}: Readonly<{
  body: string;
  title: string;
}>) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#f3f8ff;font-family:Arial,sans-serif;color:#20343A;">
    <main style="min-height:100vh;display:grid;place-items:center;padding:24px;">
      <section style="max-width:520px;background:#ffffff;border:1px solid #d9e8f7;border-radius:16px;padding:28px;text-align:center;">
        <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#1FA77A;font-weight:800;">MattaNutra</div>
        <h1 style="margin:14px 0 10px;font-size:28px;line-height:1.15;color:#20343A;">${escapeHtml(title)}</h1>
        <p style="margin:0;color:#5c6670;line-height:1.6;font-size:15px;">${escapeHtml(body)}</p>
      </section>
    </main>
  </body>
</html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const result = await cancelReassessmentActionByToken(token);
  let status = 200;
  let title = "You are unsubscribed";
  let body =
    "Your recurring reassessment reminder has been cancelled. You can opt in again from the assessment whenever you like.";

  if (result.reason === "invalid_token") {
    status = 400;
    title = "Invalid unsubscribe link";
    body =
      "This unsubscribe link is incomplete. Please use the link from your latest MattaNutra email.";
  } else if (result.reason === "not_found") {
    status = 404;
    title = "Unsubscribe link not found";
    body =
      "We could not find an active reassessment reminder for this link. It may already have been removed.";
  } else if (result.reason === "already_cancelled") {
    title = "Already unsubscribed";
    body = "This reassessment reminder was already cancelled.";
  } else if (result.reason === "not_active") {
    title = "No active reminder";
    body = "There is no active reassessment reminder to cancel for this link.";
  }

  return new NextResponse(unsubscribePage({ body, title }), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8"
    },
    status
  });
}
