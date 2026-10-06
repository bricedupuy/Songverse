import { Resend } from "resend";
import { getEffectiveAuthSettings } from "./auth-settings.js";

/**
 * Sends transactional email via Resend, using whichever Resend API key is
 * currently effective - the admin-managed one (Admin > Auth) if set, else
 * RESEND_API_KEY (see auth-settings.ts for the resolution order). If
 * neither is set (e.g. local dev), logs the email instead of sending it,
 * so auth flows that require an email step (verification, password reset)
 * still work without needing a real Resend account. This is the only
 * place Songverse sends email - keep it that way, since Resend's free tier
 * has a low daily/monthly send cap and this app should only ever send
 * account mail (verification, password reset, email change) and a person's
 * request to connect (#79, limited per requester in PeopleService), never
 * bulk or marketing mail.
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
    subject: "Verify your Songverse email",
    text: `Welcome to Songverse! Confirm your email address to finish setting up your account:\n\n${url}\n\nIf you didn't create this account, you can ignore this email.`,
    html: `
      <p>Welcome to Songverse! Confirm your email address to finish setting up your account.</p>
      <p><a href="${url}">Verify email</a></p>
      <p style="color:#666;font-size:13px">If you didn't create this account, you can ignore this email.</p>
    `,
  });
}

/** Second step of an email change: proves the user controls the new address. */
export async function sendNewEmailVerification(to: string, url: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Confirm your new Songverse email",
    text: `Confirm this address to finish changing the email on your Songverse account:\n\n${url}\n\nIf you didn't ask for this, you can ignore this email.`,
    html: `
      <p>Confirm this address to finish changing the email on your Songverse account.</p>
      <p><a href="${url}">Confirm new email</a></p>
      <p style="color:#666;font-size:13px">If you didn't ask for this, you can ignore this email.</p>
    `,
  });
}

/** First step of an email change, sent to the current address so a hijacked session can't redirect the account. */
export async function sendChangeEmailConfirmation(to: string, newEmail: string, url: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Approve your Songverse email change",
    text: `Someone asked to change the email on your Songverse account to ${newEmail}. If that was you, approve it here:\n\n${url}\n\nIf it wasn't you, ignore this email and consider changing your password - your email won't change.`,
    html: `
      <p>Someone asked to change the email on your Songverse account to <strong>${escapeHtml(newEmail)}</strong>. If that was you, approve it below.</p>
      <p><a href="${url}">Approve email change</a></p>
      <p style="color:#666;font-size:13px">If it wasn't you, ignore this email and consider changing your password - your email won't change.</p>
    `,
  });
}

/** An invitation to create an account (issue #198), for when sign-up is by invitation only. */
export async function sendSignupInvitation(to: string, url: string, inviterName: string | null): Promise<void> {
  const who = inviterName ? `${inviterName} invited you` : "You're invited";
  await sendEmail({
    to,
    subject: `${who} to Songverse`,
    text: `${who} to create an account on Songverse, for your band's or church's songs, sets and rehearsals:\n\n${url}\n\nThe invitation is for this email address and works for two weeks. If you weren't expecting it, you can ignore this email.`,
    html: `
      <p>${escapeHtml(who)} to create an account on Songverse, for your band's or church's songs, sets and rehearsals.</p>
      <p><a href="${url}">Create your account</a></p>
      <p style="color:#666;font-size:13px">The invitation is for this email address and works for two weeks. If you weren't expecting it, you can ignore this email.</p>
    `,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export async function sendPasswordResetEmail(to: string, url: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Reset your Songverse password",
    text: `Someone requested a password reset for your Songverse account:\n\n${url}\n\nIf you didn't request this, you can ignore this email - your password won't change.`,
    html: `
      <p>Someone requested a password reset for your Songverse account.</p>
      <p><a href="${url}">Reset password</a></p>
      <p style="color:#666;font-size:13px">If you didn't request this, you can ignore this email - your password won't change.</p>
    `,
  });
}

/**
 * Someone asks to connect (issue #79). The same email whether the address
 * has an account or not: without one, it's an invitation - signing up with
 * this address finds the request waiting in People.
 */
export async function sendConnectionRequestEmail(to: string, from: string, url: string): Promise<void> {
  await sendEmail({
    to,
    subject: `${from} would like to share songs with you on Songverse`,
    text: `${from} would like to share songs with you on Songverse. To say yes (or no), sign in - or sign up with this address - and open People:\n\n${url}\n\nIf you don't know them, you can ignore this email.`,
    html: `
      <p><strong>${escapeHtml(from)}</strong> would like to share songs with you on Songverse.</p>
      <p>To say yes (or no), sign in - or sign up with this address - and open People.</p>
      <p><a href="${url}">Open People</a></p>
      <p style="color:#666;font-size:13px">If you don't know them, you can ignore this email.</p>
    `,
  });
}
