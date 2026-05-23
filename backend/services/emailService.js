class EmailService {
  constructor() {
    this.isReady = false;
    this._initialized = false;
  }

  _ensureInitialized() {
    if (!this._initialized) {
      this._initialized = true;
      const key = process.env.SENDGRID_API_KEY;
      if (key && key.startsWith('SG.') && key.length >= 50) {
        this.isReady = true;
        console.log('📧 Email service: SendGrid fetch mode ready');
      } else {
        console.warn('📧 Email service: no valid SendGrid key — emails will be skipped');
      }
    }
  }

  async _sendViaSendGrid(toEmail, subject, htmlContent) {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.EMAIL_USER || process.env.GMAIL_USER || 'cleanisaac48@gmail.com';

    const body = JSON.stringify({
      personalizations: [{ to: [{ email: toEmail }] }],
      from: { email: fromEmail, name: 'Onraiser' },
      subject,
      content: [{ type: 'text/html', value: htmlContent }],
      tracking_settings: {
        click_tracking: { enable: false },
        open_tracking: { enable: false }
      }
    });

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body
    });

    if (res.status === 202) {
      console.log(`✅ SendGrid email sent to: ${toEmail}`);
      return { success: true, messageId: res.headers.get('x-message-id') || '' };
    }

    const errBody = await res.text().catch(() => '');
    throw new Error(`SendGrid HTTP ${res.status}: ${errBody}`);
  }

  async sendOTP(toEmail, otp, type = 'register') {
    this._ensureInitialized();

    const subject = type === 'register'
      ? 'Your Onraiser OTP Code'
      : 'Reset Your Password - OTP';
    const title = type === 'register' ? 'Welcome to Onraiser!' : 'Password Reset Request';

    const htmlContent = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#333;">${title}</h2>
        <p>Your OTP ${type === 'register' ? 'verification' : 'to reset your password'} code is:</p>
        <div style="background:#f4f4f4;padding:20px;text-align:center;margin:20px 0;">
          <h1 style="color:#007bff;margin:0;font-size:32px;letter-spacing:5px;">${otp}</h1>
        </div>
        <p style="color:#666;">This code expires in 5 minutes.</p>
        <p style="color:#666;">If you didn't request this ${type === 'register' ? 'code' : 'reset'}, please ignore this email.</p>
      </div>
    `;

    if (!this.isReady) {
      console.warn(`📧 Email service not ready — skipping OTP email to ${toEmail}`);
      return { success: false, skipped: true };
    }

    try {
      return await this._sendViaSendGrid(toEmail, subject, htmlContent);
    } catch (err) {
      console.error(`📧 Failed to send ${type} OTP to ${toEmail}:`, err.message);
      throw err;
    }
  }

  async sendStatusUpdateEmail(toEmail, status, adminMessage = '') {
    this._ensureInitialized();

    const subject = status === 'approved'
      ? 'Profile Approved - Onraiser'
      : 'Profile Disapproved - Onraiser';
    const loginLink = `${process.env.FRONTEND_URL || 'http://0.0.0.0:5000'}/login.html`;

    const htmlContent = status === 'approved'
      ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#2ecc71;">Congratulations! Your profile has been approved.</h2>
          <p>You can now access your Onraiser dashboard and start exploring job opportunities.</p>
          <p><strong>Admin Message:</strong> ${adminMessage || 'Welcome to Onraiser!'}</p>
          <p><a href="${loginLink}" style="background-color:#2ecc71;color:white;padding:12px 24px;text-decoration:none;border-radius:5px;display:inline-block;margin-top:10px;">Access Your Dashboard</a></p>
        </div>`
      : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#e74c3c;">Profile Disapproved - Action Required</h2>
          <p>Your Onraiser profile submission has been disapproved and requires updates.</p>
          <p><strong>Admin Message:</strong> ${adminMessage || 'Please review and resubmit your information.'}</p>
          <p>Please login to your account and use the "Upload Again" button to restart your verification process.</p>
          <p><a href="${loginLink}" style="background-color:#e74c3c;color:white;padding:12px 24px;text-decoration:none;border-radius:5px;display:inline-block;margin-top:10px;">Login to Resubmit</a></p>
        </div>`;

    if (!this.isReady) {
      console.warn(`📧 Email service not ready — skipping status email to ${toEmail}`);
      return { success: false, skipped: true };
    }

    try {
      return await this._sendViaSendGrid(toEmail, subject, htmlContent);
    } catch (err) {
      console.error(`📧 Failed to send status update email to ${toEmail}:`, err.message);
      throw err;
    }
  }

  getServiceType() {
    this._ensureInitialized();
    return this.isReady ? 'SendGrid API (fetch)' : 'none';
  }

  isServiceReady() {
    this._ensureInitialized();
    return this.isReady;
  }
}

module.exports = new EmailService();
