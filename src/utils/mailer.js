// Sends email via the Mailersend HTTP API (port 443) — works on Render, which
// blocks outbound SMTP. Needs MAILERSEND_API_KEY and EMAIL_FROM.
// EMAIL_FROM must be a verified sender in Mailersend (Email → Domains & Senders).
const MAILERSEND_API_KEY = process.env.MAILERSEND_API_KEY;
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
  if (!MAILERSEND_API_KEY) {
    console.log(`[mailer] MAILERSEND_API_KEY not set. Email to ${to} skipped.`);
    return;
  }

  const res = await fetch("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MAILERSEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: { email: FROM_EMAIL, name: FROM_NAME },
      to: [{ email: to }],
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const result = await res.json().catch(() => ({}));
    throw new Error(`Mailersend failed to send email: ${JSON.stringify(result)}`);
  }
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

module.exports = { sendEmail, sendVerificationEmail };