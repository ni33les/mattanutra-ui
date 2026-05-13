import nodemailer from "nodemailer";

type SendTransactionalEmailInput = Readonly<{
  html: string;
  subject: string;
  to: string;
}>;

export type SendTransactionalEmailResult = Readonly<{
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
  html,
  subject,
  to
}: SendTransactionalEmailInput): Promise<SendTransactionalEmailResult> {
  if (!isSmtpConfigured()) {
    return { reason: "SMTP is not configured", sent: false };
  }

  const port = envPort();
  const secure = envSecure(port);
  const transporter = nodemailer.createTransport({
    auth: {
      pass: envText("SMTP_PASSWORD"),
      user: envText("SMTP_USER")
    },
    host: envText("SMTP_HOST"),
    port,
    requireTLS: !secure,
    secure
  });
  const result = await transporter.sendMail({
    from: envText("SMTP_FROM"),
    html,
    replyTo: envText("SMTP_REPLY_TO") || undefined,
    subject,
    to
  });

  return {
    messageId: result.messageId,
    sent: true
  };
}
