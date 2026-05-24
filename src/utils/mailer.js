const { Resend } = require("resend");

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// Must be a domain you've verified in Resend. onboarding@resend.dev works for
// testing but only delivers to the Resend account owner's own email address.
const FROM = process.env.EMAIL_FROM || "Esports Adda <onboarding@resend.dev>";

function buildHtml({ username, url }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Welcome to Esports Adda!</h2>
      <p>Hi ${username},</p>
      <p>Thank you for signing up! Please verify your email address by clicking the button below:</p>
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

async function sendVerificationEmail({ to, username, url }) {
  // No key configured (e.g. local dev): log the link instead of sending.
  if (!resend) {
    console.log(`[mailer] RESEND_API_KEY not set. Verification link for ${to}: ${url}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "Verify Your Email - Esports Adda",
    html: buildHtml({ username, url }),
    text: `Welcome to Esports Adda! Please verify your email by clicking this link: ${url}`,
  });

  if (error) {
    throw new Error(`Resend failed to send email: ${error.message || error}`);
  }
}

module.exports = { sendVerificationEmail };
