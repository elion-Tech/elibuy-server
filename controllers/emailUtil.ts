import { Resend } from 'resend';

const createResendClient = () => {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY is not set. Skipping email sending.');
    return null;
  }
  return new Resend(process.env.RESEND_API_KEY);
};

export const sendOrderConfirmationEmail = async (email: string, order: any) => {
  const resend = createResendClient();
  if (!resend) return;

  try {
    await resend.emails.send({
      from: 'Elibuy <onboarding@resend.dev>', // Use the default Resend domain for now
      to: [email],
      subject: `Order Confirmation #${order._id}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 20px auto; border: 1px solid #ddd; border-radius: 8px; padding: 20px;">
          <h1 style="color: #4F46E5;">Thank you for your order!</h1>
          <p>Your order <strong>#${order._id}</strong> has been successfully placed.</p>
        </div>
      `,
    });
    console.log(`Order confirmation email sent to ${email}.`);
  } catch (error) {
    console.error('Error sending order confirmation email:', error);
  }
};

export const sendPasswordResetEmail = async (email: string, resetUrl: string) => {
  const resend = createResendClient();
  if (!resend) return;

  try {
    await resend.emails.send({
      from: 'Elibuy <onboarding@resend.dev>',
      to: [email],
      subject: 'Your Password Reset Link',
      html: `
        <p>You requested a password reset. Click the link below:</p>
        <a href="${resetUrl}">Reset Password</a>
      `,
    });
    console.log(`Password reset email sent to ${email}.`);
  } catch (error) {
    console.error('Error sending password reset email:', error);
  }
};