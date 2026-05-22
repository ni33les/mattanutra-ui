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
	    <link rel="stylesheet" href="/customer-standalone.css" />
	    <title>${escapeHtml(title)}</title>
	  </head>
	  <body class="mn-standalone-page">
	    <main class="mn-standalone-main">
	      <section class="mn-standalone-card">
	        <div class="mn-standalone-brand">MattaNutra</div>
	        <h1 class="mn-standalone-title">${escapeHtml(title)}</h1>
	        <p class="mn-standalone-body">${escapeHtml(body)}</p>
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
