import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP is optional. When SMTP_HOST is not configured the app runs without a
 * mailer: password reset and email verification links are still generated,
 * but they must be shared out-of-band (e.g. by an admin) instead of emailed.
 */
export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!isSmtpConfigured()) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USERNAME
      ? {
          user: process.env.SMTP_USERNAME,
          pass: process.env.SMTP_PASSWORD,
        }
      : undefined,
  });

  return transporter;
}

export async function sendMail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ sent: boolean }> {
  const client = getTransporter();
  if (!client) {
    // No SMTP configured: log for visibility in dev/self-hosted setups
    // without swallowing the intent of the email.
    console.warn(
      `[mailer] SMTP not configured; not sending email to ${options.to}: ${options.subject}`,
    );
    return { sent: false };
  }

  await client.sendMail({
    from: process.env.SMTP_FROM ?? "RadTempo <no-reply@radtempo.local>",
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });

  return { sent: true };
}
