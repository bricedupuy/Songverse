import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM ?? "SongVerse <onboarding@resend.dev>";

const resend = resendApiKey ? new Resend(resendApiKey) : null;

/**
 * Sends transactional email via Resend. If RESEND_API_KEY isn't set (e.g.
 * local dev), logs the email instead of sending it, so auth flows that
 * require an email step (verification, password reset) still work without
 * needing a real Resend account. This is the only place SongVerse sends
 * email - keep it that way, since Resend's free tier has a low daily/monthly
 * send cap and this app should only ever send verification/reset mail, never
 * bulk or marketing mail.
 */
async function sendEmail(params: { to: string; subject: string; html: string; text: string }): Promise<void> {
  if (!resend) {
    console.info(`[email:dev] To: ${params.to}\nSubject: ${params.subject}\n\n${params.text}`);
    return;
  }
  const { error } = await resend.emails.send({
    from: emailFrom,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
  if (error) {
    throw new Error(`Failed to send email via Resend: ${error.message}`);
  }
}

export async function sendVerificationEmail(to: string, url: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Verify your SongVerse email",
    text: `Welcome to SongVerse! Confirm your email address to finish setting up your account:\n\n${url}\n\nIf you didn't create this account, you can ignore this email.`,
    html: `
      <p>Welcome to SongVerse! Confirm your email address to finish setting up your account.</p>
      <p><a href="${url}">Verify email</a></p>
      <p style="color:#666;font-size:13px">If you didn't create this account, you can ignore this email.</p>
    `,
  });
}

export async function sendPasswordResetEmail(to: string, url: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Reset your SongVerse password",
    text: `Someone requested a password reset for your SongVerse account:\n\n${url}\n\nIf you didn't request this, you can ignore this email - your password won't change.`,
    html: `
      <p>Someone requested a password reset for your SongVerse account.</p>
      <p><a href="${url}">Reset password</a></p>
      <p style="color:#666;font-size:13px">If you didn't request this, you can ignore this email - your password won't change.</p>
    `,
  });
}
