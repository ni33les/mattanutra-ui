import nodemailer from "nodemailer";

export type TransactionalEmailAttachment = Readonly<{
  content: Buffer | string;
  contentType?: string;
  filename: string;
}>;

type SendTransactionalEmailInput = Readonly<{
  attachments?: readonly TransactionalEmailAttachment[];
  messageId?: string;
  html: string;
  subject: string;
  to: string;
}>;

export type SendTransactionalEmailResult = Readonly<{
  outcome?: "accepted" | "rejected" | "unknown";
  messageId?: string;
  reason?: string;
  sent: boolean;
}>;

function envText(name: string) {
  return (process.env[name] ?? "").trim();
}

function envPort() {
  const parsed = Number(envText("SMTP_PORT") || "587");

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 587;
}

function envSecure(port: number) {
  const configured = envText("SMTP_SECURE").toLowerCase();

  if (configured === "true" || configured === "1" || configured === "yes") {
    return true;
  }

  if (configured === "false" || configured === "0" || configured === "no") {
    return false;
  }

  return port === 465;
}

export function isSmtpConfigured() {
  return Boolean(
    envText("SMTP_HOST") &&
      envText("SMTP_USER") &&
      envText("SMTP_PASSWORD") &&
      envText("SMTP_FROM")
  );
}

export async function sendTransactionalEmail({
  attachments,
  messageId,
  html,
  subject,
  to
}: SendTransactionalEmailInput): Promise<SendTransactionalEmailResult> {
  if (!isSmtpConfigured()) {
    return { reason: "SMTP is not configured", sent: false, outcome: "rejected" };
  }

  const port = envPort();
  const secure = envSecure(port);
  const transporter = nodemailer.createTransport({
    auth: {
      pass: envText("SMTP_PASSWORD"),
      user: envText("SMTP_USER")
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    host: envText("SMTP_HOST"),
    port,
    requireTLS: !secure,
    secure
  });
  try {
  const result = await transporter.sendMail({
    messageId,
    attachments: attachments?.map((attachment) => ({
      content: attachment.content,
      contentType: attachment.contentType,
      filename: attachment.filename
    })),
    from: envText("SMTP_FROM"),
    html,
    replyTo: envText("SMTP_REPLY_TO") || undefined,
    subject,
    to
  });

  return {
    messageId: result.messageId,
    sent: Array.isArray(result.accepted) && result.accepted.length > 0,
    outcome: Array.isArray(result.accepted) && result.accepted.length > 0 ? "accepted" : "rejected",
    reason: result.rejected?.length ? "SMTP rejected the recipient" : undefined
  };
  } catch (error) {
    const e = error as { command?: string; responseCode?: number; message?: string };
    const definite = (e.responseCode ?? 0) >= 400 || /^(CONN|AUTH|EHLO|HELO|MAIL FROM|RCPT TO)$/i.test(e.command ?? "");
    return { sent: false, outcome: definite ? "rejected" : "unknown", reason: e.message ?? "SMTP delivery failed" };
  } finally { transporter.close(); }
}
