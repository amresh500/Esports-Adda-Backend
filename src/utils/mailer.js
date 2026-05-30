// Sends email via the Brevo HTTP API (port 443) — works on Render, which
// blocks outbound SMTP. Needs BREVO_API_KEY and EMAIL_FROM.
// EMAIL_FROM must be a verified sender in Brevo (Senders, Domains & Dedicated IPs).
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM || "no-reply@example.com";
const FROM_NAME = process.env.EMAIL_FROM_NAME || "Esports Adda";

function buildHtml({ username, url, accountType }) {
  const intro =
    accountType === "organization"
      ? "Thank you for registering your organization!"
      : "Thank you for signing up!";
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Welcome to Esports Adda!</h2>
      <p>Hi ${username},</p>
      <p>${intro} Please verify your email address by clicking the button below:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${url}" style="background-color: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
      </div>
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #666;">${url}</p>
      <p style="color: #999; font-size: 12px; margin-top: 30px;">This link will expire in 24 hours.</p>
      <p style="color: #999; font-size: 12px;">If you didn't create an account, please ignore this email.</p>
    </div>
  `;
}

async function sendEmail({ to, subject, html, text }) {
  // Not configured (e.g. local dev): log instead of sending.
  if (!BREVO_API_KEY) {
    console.log(`[mailer] BREVO_API_KEY not set. Email to ${to} skipped.`);
    return;
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      "api-key": BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { email: FROM_EMAIL, name: FROM_NAME },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!res.ok) {
    const result = await res.json().catch(() => ({}));
    throw new Error(`Brevo failed to send email: ${JSON.stringify(result)}`);
  }
}

function buildResetHtml({ otp }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Reset your password</h2>
      <p>We received a request to reset your Esports Adda password. Use the code below to continue:</p>
      <div style="text-align: center; margin: 30px 0;">
        <span style="font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #4F46E5;">${otp}</span>
      </div>
      <p style="color: #999; font-size: 12px;">This code expires in 10 minutes.</p>
      <p style="color: #999; font-size: 12px;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
    </div>
  `;
}

async function sendPasswordResetEmail({ to, otp }) {
  await sendEmail({
    to,
    subject: "Reset Your Password - Esports Adda",
    html: buildResetHtml({ otp }),
    text: `Your Esports Adda password reset code is ${otp}. It expires in 10 minutes. If you didn't request this, ignore this email.`,
  });
}

function buildEmailChangeHtml({ url }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Confirm your new email</h2>
      <p>We received a request to change the email on your Esports Adda account to this address. Click the button below to confirm:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${url}" style="background-color: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Confirm New Email</a>
      </div>
      <p>Or copy this link into your browser:</p>
      <p style="word-break: break-all; color: #666;">${url}</p>
      <p style="color: #999; font-size: 12px; margin-top: 30px;">This link expires in 24 hours. If you didn't request this change, you can safely ignore it — your current email stays unchanged.</p>
    </div>
  `;
}

async function sendEmailChangeVerification({ to, url }) {
  await sendEmail({
    to,
    subject: "Confirm Your New Email - Esports Adda",
    html: buildEmailChangeHtml({ url }),
    text: `Confirm your new Esports Adda email by clicking: ${url} — link expires in 24 hours.`,
  });
}

async function sendVerificationEmail({ to, username, url, accountType = "user" }) {
  const subject =
    accountType === "organization"
      ? "Verify Your Organization Account - Esports Adda"
      : "Verify Your Email - Esports Adda";
  await sendEmail({
    to,
    subject,
    html: buildHtml({ username, url, accountType }),
    text: `Welcome to Esports Adda! Please verify your email by clicking this link: ${url}`,
  });
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendEmailChangeVerification,
};