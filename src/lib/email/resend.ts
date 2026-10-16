/**
 * The raw Resend client: one POST to its email API per message, with no SDK (AGENTS.md Rule 2:
 * `fetch` already does it). Replaced for the whole unit tier by src/test/preload.ts, which is why
 * it holds no decision worth a test; the services that send decide what to do when it throws.
 *
 * In development without RESEND_API_KEY the email goes to the log instead, so sign-in works on a
 * laptop; production refuses to start without the key (src/env.ts).
 */

import { env } from '../../env.ts';
import { logger } from '../server/logger.ts';

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Base64 content, as Resend takes it (the data export's CSV). */
  attachments?: { filename: string; content: string }[];
};

const RESEND_URL = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 10_000;

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (env.RESEND_API_KEY === undefined) {
    logger.info({ subject: message.subject, body: message.text }, 'Email written to the log');
    return;
  }
  const response = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.attachments,
    }),
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Resend answered ${response.status}`);
}
