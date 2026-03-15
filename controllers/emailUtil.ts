import nodemailer from 'nodemailer';

const createTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('Email credentials (EMAIL_USER, EMAIL_PASS) are not set. Skipping email sending.');
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail', // You can change this to another service or use SMTP
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // For Gmail, this should be an App Password
    },
  });
};

export const sendOrderConfirmationEmail = async (email: string, order: any) => {
  const transporter = createTransporter();
  if (!transporter) return;

  const mailOptions = {
    from: `"Elibuy" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Order Confirmation #${order._id}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 20px auto; border: 1px solid #ddd; border-radius: 8px; padding: 20px;">
        <h1 style="color: #4F46E5;">Thank you for your order!</h1>
        <p>Hi there,</p>
        <p>Your order <strong>#${order._id}</strong> has been successfully placed.</p>
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Total Amount:</strong> ₦${order.total_amount.toLocaleString()}</p>
          <p><strong>Status:</strong> ${order.status}</p>
          <p><strong>Shipping To:</strong><br/>
          ${order.shippingDetails?.streetAddress}, ${order.shippingDetails?.lga}, ${order.shippingDetails?.state}</p>
        </div>
        <p>We will notify you when your order is shipped.</p>
        <p style="font-size: 12px; color: #888;">Thank you for shopping with Elibuy.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Order confirmation email sent to ${email}.`);
  } catch (error) {
    console.error('Error sending order confirmation email:', error);
  }
};

export const sendPasswordResetEmail = async (email: string, resetUrl: string) => {
  const transporter = createTransporter();
  if (!transporter) return;

  const mailOptions = {
    from: `"Elibuy" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Your Password Reset Link',
    html: `
      <p>You requested a password reset. Please click the link below to reset your password:</p>
      <a href="${resetUrl}" target="_blank">Reset Password</a>
      <p>This link will expire in 10 minutes.</p>
      <p>If you did not request this, please ignore this email.</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Password reset email sent to ${email}.`);
  } catch (error) {
    console.error('Error sending password reset email:', error);
  }
};