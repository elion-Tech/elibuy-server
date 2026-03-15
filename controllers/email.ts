import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail', // You can change this to 'hotmail', 'yahoo', etc. or use host/port
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendOrderConfirmationEmail = async (email: string, order: any) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('Skipping email: EMAIL_USER or EMAIL_PASS not set in .env');
    return;
  }

  const mailOptions = {
    from: `"Elibuy" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Order Confirmation #${order._id}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #4F46E5;">Thank you for your order!</h1>
        <p>Hi there,</p>
        <p>Your order <strong>#${order._id}</strong> has been successfully placed.</p>
        <div style="background-color: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Total Amount:</strong> ₦${order.total_amount.toLocaleString()}</p>
          <p><strong>Status:</strong> ${order.status}</p>
          <p><strong>Shipping To:</strong><br/>
          ${order.shippingDetails?.streetAddress}, ${order.shippingDetails?.lga}, ${order.shippingDetails?.state}</p>
        </div>
        <p>We will notify you when your order is shipped.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Order confirmation email sent to ${email}`);
  } catch (error) {
    console.error('Error sending email:', error);
  }
};