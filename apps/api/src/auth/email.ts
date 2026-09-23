import { Resend } from "resend";
import { getEffectiveAuthSettings } from "./auth-settings";

/**
 * Sends transactional email via Resend, using whichever Resend API key is
 * currently effective - the admin-managed one (Admin > Auth) if set, else
 * RESEND_API_KEY (see auth-settings.ts for the resolution order). If
 * neither is set (e.g. local dev), logs the email instead of sending it,
 * so auth flows that require an email step (verification, password reset)
 * still work without needing a real Resend account. This is the only
 * place SongVerse sends email - keep it that way, since Resend's free tier
 * has a low daily/monthly send cap and this app should only ever send
 * account mail (verification, password reset, email change), never bulk or
 * marketing mail.
 */
async function sendEmail(params: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const settings = await getEffectiveAuthSettings();
  if (!settings.resendApiKey) {
    console.info(`[email:dev] To: ${params.to}\nSubject: ${params.subject}\n\n${params.text}`);
    return;
  }
  const resend = new Resend(settings.resendApiKey);
  const { error } = await resend.emails.send({
    from: settings.emailFrom,
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

/** Second step of an email change: proves the user controls the new address. */
export async function sendNewEmailVerification(to: string, url: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Confirm your new SongVerse email",
    text: `Confirm this address to finish changing the email on your SongVerse account:\n\n${url}\n\nIf you didn't ask for this, you can ignore this email.`,
    html: `
      <p>Confirm this address to finish changing the email on your SongVerse account.</p>
      <p><a href="${url}">Confirm new email</a></p>
      <p style="color:#666;font-size:13px">If you didn't ask for this, you can ignore this email.</p>
    `,
  });
}

/** First step of an email change, sent to the current address so a hijacked session can't redirect the account. */
export async function sendChangeEmailConfirmation(to: string, newEmail: string, url: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Approve your SongVerse email change",
    text: `Someone asked to change the email on your SongVerse account to ${newEmail}. If that was you, approve it here:\n\n${url}\n\nIf it wasn't you, ignore this email and consider changing your password - your email won't change.`,
    html: `
      <p>Someone asked to change the email on your SongVerse account to <strong>${escapeHtml(newEmail)}</strong>. If that was you, approve it below.</p>
      <p><a href="${url}">Approve email change</a></p>
      <p style="color:#666;font-size:13px">If it wasn't you, ignore this email and consider changing your password - your email won't change.</p>
    `,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
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
