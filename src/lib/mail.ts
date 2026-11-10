import "server-only";
import { createTransport } from "nodemailer";

/** Email goes out only when an SMTP server is configured; without one, nothing offers to send it. */
export const mailEnabled = () => Boolean(process.env.SMTP_HOST);

export async function sendMail({ to, subject, text }: { to: string; subject: string; text: string }) {
  const port = Number(process.env.SMTP_PORT) || 587;
  const transport = createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is TLS from the start; other ports upgrade with STARTTLS.
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
}
