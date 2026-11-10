import "server-only";
import { WebPushError, sendNotification } from "web-push";

/** Push reminders exist only when the server has VAPID keys, as password reset needs SMTP_HOST. */
export function vapidPublicKey(): string | null {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  return VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT ? VAPID_PUBLIC_KEY : null;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url: string;
  /** A newer notification with the same tag replaces the older one. */
  tag: string;
}

/** Sends one notification. "gone" when the push service says the subscription no longer exists. */
export async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, message: PushMessage): Promise<"sent" | "gone"> {
  try {
    await sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(message), {
      vapidDetails: { subject: process.env.VAPID_SUBJECT!, publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY! },
      // A reminder that can't be delivered within the hour is no longer worth delivering.
      TTL: 3600,
    });
    return "sent";
  } catch (e) {
    if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) return "gone";
    throw e;
  }
}
