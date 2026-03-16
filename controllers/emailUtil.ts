import { Resend } from 'resend';

const createResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // This is a critical error for email functionality.
    console.error('CRITICAL: RESEND_API_KEY environment variable is not set. Email functionality is disabled.');
    return null;
  }
  // For debugging, log a masked version of the key to confirm it's loaded.
  console.log(`Resend client created. API Key loaded successfully (re_...).`);
  return new Resend(apiKey);
};

export const sendOrderConfirmationEmail = async (email: string, order: any) => {
  const resend = createResendClient();
  if (!resend) return;

  try {
    const { data, error } = await resend.emails.send({
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

    if (error) {
      console.error('Resend API returned an error for Order Confirmation:', error);
    } else {
      console.log(`Order confirmation email sent to ${email}. ID: ${data?.id}`);
    }
  } catch (error) {
    console.error('Error sending order confirmation email:', error);
  }
};

export const sendPasswordResetEmail = async (email: string, resetUrl: string) => {
  const resend = createResendClient();
  if (!resend) return;

  try {
    const { data, error } = await resend.emails.send({
      from: 'Elibuy <onboarding@resend.dev>',
      to: [email],
      subject: 'Your Password Reset Link',
      html: `
        <p>You requested a password reset. Click the link below:</p>
        <a href="${resetUrl}">Reset Password</a>
      `,
    });

    if (error) {
      console.error('Resend API returned an error for Password Reset:', error);
    } else {
      console.log(`Password reset email sent to ${email}. ID: ${data?.id}`);
    }
  } catch (error) {
    console.error('Error sending password reset email:', error);
  }
};