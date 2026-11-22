const nodemailer = require('nodemailer');

async function sendPasswordResetEmail({ config, email, token }) {
  const { smtp } = config;
  if (!smtp.host || !smtp.user || !smtp.password || !smtp.from) {
    const error = new Error('Password reset email is not configured');
    error.status = 503;
    throw error;
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.password },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  });
  const resetUrl = new URL('/reset-password', config.publicAppUrl);
  resetUrl.searchParams.set('token', token);
  const link = resetUrl.toString();

  await transporter.sendMail({
    from: smtp.from,
    to: email,
    subject: 'Reset your Group Contribution Tracker password',
    text: `Use this link to reset your password. It expires in one hour:\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Use this link to reset your password. It expires in one hour:</p><p><a href="${link}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`
  });
}

module.exports = { sendPasswordResetEmail };
