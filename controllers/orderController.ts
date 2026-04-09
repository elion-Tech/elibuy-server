import crypto from 'crypto';
import { Request, Response } from 'express';
import { Order, Product, User, Cart, IProduct, IUser } from '../models/mongooseModels.js';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth.js'; 
import { sendOrderConfirmationEmail } from './emailUtil.js';

export const createOrder = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  
  const shopper = await User.findById(req.user.id);
  if (!shopper) return res.status(404).json({ error: "Shopper not found" });

  const { items, total_amount, payment_reference, shippingDetails } = req.body; 

  console.log(`[Order] Creating order for user ${req.user.id}. Ref: ${payment_reference}`);
  console.log(`[Order] Payload items: ${JSON.stringify(items)}`);

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "No items provided" });
  }

  try {
    const orderItems = [];
    
    // 1. Process items serially to ensure stock validation and data integrity
    for (const [index, item] of items.entries()) {
      const productId = item.product_id || item.id;
      if (!productId) throw new Error(`Item at index ${index} is missing product_id`);

      const product = await Product.findById(productId).populate('vendor_id');
      if (!product) throw new Error(`Product not found: ${productId} (Index: ${index})`);

      // Check Stock
      if (product.stock < Number(item.quantity)) {
        throw new Error(`Insufficient stock for product: ${product.name}. Available: ${product.stock}`);
      }

      const vendor = product.vendor_id as unknown as IUser;

      orderItems.push({
        product_id: product._id,
        vendor_id: vendor._id,
        quantity: Number(item.quantity),
        price: product.price, // ALWAYS use DB price
        name: product.name,
        image_url: product.image_url,
        vendor_name: vendor?.name || 'Elibuy Vendor',
        size: item.size || ''
      });
    }

    // 2. Create the Order
    const order = new Order({
      shopper_id: req.user.id,
      shopper_name: shopper.name,
      shopper_email: shopper.email,
      total_amount: Number(total_amount) || 0,
      payment_reference,
      status: 'PAID',
      shippingDetails: shippingDetails || {},
      items: orderItems
    });
    
    const savedOrder = await order.save();
    console.log(`[Order] Order saved successfully: ${order._id}`);

    // 3. Update product stock (Decrement)
    // We use $inc with a negative number to subtract efficiently
    for (const item of orderItems) {
      try {
        await Product.findByIdAndUpdate(item.product_id, { $inc: { stock: -item.quantity } });
      } catch (err) {
        console.error(`Failed to update stock for product ${item.product_id}:`, err);
      }
    }

    // 4. Send confirmation email
    try {
      if (shopper && shopper.email) {
        sendOrderConfirmationEmail(shopper.email, savedOrder).catch((err: any) => console.error("Failed to send email:", err));
      }
    } catch (err) {
      console.error("Failed to fetch user for email:", err);
    }

    res.status(201).json({ success: true, orderId: savedOrder._id });
    
  }  catch (error: any) {
    console.error("Error creating order:", error);
    if (error.name === 'ValidationError') {
      console.error("Validation Details:", JSON.stringify(error.errors, null, 2));
    }
    res.status(400).json({ error: error.message });
  }
};

export const handlePaystackWebhook = async (req: Request, res: Response) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error("[Webhook] CRITICAL: PAYSTACK_SECRET_KEY is not set. Cannot verify webhook signature.");
    // Respond with 200 to prevent Paystack from retrying indefinitely,
    // but log the critical error.
    return res.sendStatus(200);
  }

  const signature = req.headers['x-paystack-signature'];
  if (!signature) {
    console.warn("[Webhook] Received webhook without signature. Ignoring.");
    return res.sendStatus(400); // Bad request, missing security header
  }
  // Paystack signature verification ensures the request is authentic
  const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(req.body)).digest('hex');

  if (hash !== signature) {
    console.error("[Webhook] Security Alert: Signature mismatch");
    return res.sendStatus(400);
  }

  const event = req.body;
  console.log(`[Webhook] Received Paystack event: ${event.event} for reference: ${event.data?.reference}`);

  if (event.event === 'charge.success') {
    const { reference, amount } = event.data; // Also get amount for verification
    if (!reference) {
      console.error("[Webhook] charge.success event missing reference. Ignoring.");
      return res.sendStatus(400);
    }

    const order = await Order.findOne({ payment_reference: reference });

    if (!order) {
      console.warn(`[Webhook] Order not found for reference ${reference}. It might have failed initial creation or is a duplicate webhook.`);
      return res.sendStatus(200); // Acknowledge, but no action needed
    }

    // Additional check: Ensure the amount matches (optional but good practice)
    // Paystack amount is in kobo/cents, so compare with order total_amount * 100
    // Assuming order.total_amount is in Naira/Dollars
    if (order.total_amount * 100 !== amount) {
      console.error(`[Webhook] Amount mismatch for order ${order._id}. Expected ${order.total_amount * 100}, got ${amount}.`);
      // You might want to flag this order for manual review
      return res.sendStatus(200);
    }

    // Only process if the order was waiting for verification
    if (order.status === 'PENDING_VERIFICATION') {
      console.log(`[Webhook] Confirming payment for order: ${order._id} (Reference: ${reference})`);
      order.status = 'PAID';
      await order.save();
      console.log(`[Webhook] Order ${order._id} status updated to PAID.`);

      // Post-payment activities (Now handled since we couldn't do it in the controller)
      console.log(`[Webhook] Activity: Updating product stocks for order ${order._id}...`);
      for (const item of order.items) {
        try {
          await Product.findByIdAndUpdate(item.product_id, { $inc: { stock: -item.quantity } });
          console.log(`[Webhook] Stock decremented for Product: ${item.name} (${item.product_id}) by ${item.quantity}`);
        } catch (stockErr) {
          console.error(`[Webhook] Failed to update stock for product ${item.product_id} in order ${order._id}:`, stockErr);
          // Consider logging this to a separate error tracking system or flagging the order
        }
      }

      // Clear the cart for the shopper
      try {
        await Cart.findOneAndDelete({ user: order.shopper_id });
        console.log(`[Webhook] Cart cleared for user ${order.shopper_id} after order ${order._id} confirmation.`);
      } catch (cartErr) {
        console.error(`[Webhook] Failed to clear cart for user ${order.shopper_id} after order ${order._id}:`, cartErr);
      }

      if (order.shopper_email) {
        console.log(`[Webhook] Activity: Triggering confirmation email to ${order.shopper_email} for order ${order._id}`);
        sendOrderConfirmationEmail(order.shopper_email, order).then(() => {
          console.log(`[Webhook] Email activity logged for Order ${order._id}`);
        }).catch((emailErr: any) => {
          console.error(`[Webhook] Failed to send email for order ${order._id}:`, emailErr);
        });
      }
    } else if (order.status === 'PAID') {
      console.log(`[Webhook] Order ${order._id} already PAID. Ignoring duplicate webhook for reference ${reference}.`);
    } else {
      console.warn(`[Webhook] Order ${order._id} has status ${order.status}. Not processing webhook for reference ${reference}.`);
    }
  }
  res.sendStatus(200); // Always respond 200 to Paystack to avoid retries, even if we don't process
};

export const verifyPayment = async (req: AuthRequest, res: Response) => {
  const { reference } = req.body;
  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

  console.log(`[Payment] Verifying reference: ${reference}`);

  if (!PAYSTACK_SECRET_KEY) {
    // If no key, we just simulate success for the demo
    return res.json({ status: 'success', data: { status: 'success' }, message: 'Payment verified (Simulated)' });
  }

  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
      }
    });
    const data = await response.json();
    if (data.status && data.data.status === 'success') {
      res.json({ status: 'success', data: data.data });
    } else {
      res.status(400).json({ status: 'failed', message: 'Payment verification failed' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getMyOrders = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  console.log(`[GetMyOrders] Fetching orders for User ID: ${req.user.id} (Role: ${req.user.role})`);

  try {
    let orders;
    if (req.user.role === 'SHOPPER') {
      orders = await Order.find({ shopper_id: req.user.id })
        .populate({
          path: 'items.product_id',
          model: 'Product',
          populate: { 
            path: 'vendor_id',
            model: 'User',
            select: 'name email'
          }
        })
        .sort({ createdAt: -1 });
    } else if (req.user.role === 'VENDOR') {
      // Find orders that contain products belonging to this vendor
      const vendorProducts = await Product.find({ vendor_id: req.user.id }).select('_id');
      const productIds = vendorProducts.map(p => p._id);
      orders = await Order.find({ 'items.product_id': { $in: productIds } })
        .populate('shopper_id', 'name email')
        .populate('items.product_id')
        .sort({ createdAt: -1 });
    } else {
      // For ADMIN or other roles, get all orders fully populated
      orders = await Order.find()
        .populate('shopper_id', 'name email')
        .populate({
          path: 'items.product_id',
          model: 'Product'
        })
        .sort({ createdAt: -1 });
    }
    console.log(`[GetMyOrders] Found ${orders.length} orders.`);
    
    // DEBUG: If 0 found, verify if ANY orders exist in the entire DB
    if (orders.length === 0) {
      const totalOrders = await Order.countDocuments();
      console.log(`[GetMyOrders] DEBUG: Total orders in system: ${totalOrders}`);
    }

    res.json(orders.map(o => ({ ...o.toObject(), id: o._id.toString() })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateOrderStatus = async (req: AuthRequest, res: Response) => {
  if (!req.user || (req.user.role !== 'LOGISTICS' && req.user.role !== 'ADMIN')) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  try {
    const { status } = req.body;
    const { id } = req.params;
    await Order.findByIdAndUpdate(id, { status });
    res.json({ message: "Status updated" });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const debugCheckDb = async (req: Request, res: Response) => {
  try {
    const dbName = mongoose.connection.db ? mongoose.connection.db.databaseName : 'UNKNOWN';
    const orderCount = await Order.countDocuments();
    const userCount = await User.countDocuments();
    const productCount = await Product.countDocuments();
    
    res.json({
      message: "Database Connection Debug",
      activeDatabase: dbName,
      counts: {
        orders: orderCount,
        users: userCount,
        products: productCount
      },
      mongoUriPart: process.env.MONGODB_URI ? process.env.MONGODB_URI.split('@')[1] : 'UNDEFINED'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllOrders = async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: "Unauthorized" });
  }
  try {
    const orders = await Order.find()
      .populate('shopper_id', 'name email')
      .populate({
        path: 'items.product_id',
        model: 'Product',
        populate: {
          path: 'vendor_id',
          model: 'User',
          select: 'name email'
        }
      }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getOrderById = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  try {
    const order = await Order.findById(req.params.id)
      .populate('shopper_id', 'name email')
      .populate({
        path: 'items.product_id',
        model: 'Product',
        populate: {
          path: 'vendor_id',
          model: 'User',
          select: 'name email'
        }
      });
    if (!order) return res.status(404).json({ error: "Order not found" });
    
    // Authorization check
    const isOwner = order.shopper_id._id.toString() === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';
    
    let isVendorForOrder = false;
    if (req.user.role === 'VENDOR') {
      const vendorId = req.user.id;
      isVendorForOrder = order.items.some(item => {
        // Check if item.vendor_id matches the logged in vendor
        const itemVendorId = (item.vendor_id as any)._id || item.vendor_id;
        return itemVendorId.toString() === vendorId;
      });
    }

    if (!isOwner && !isAdmin && !isVendorForOrder) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json(order);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteOrder = async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: "Unauthorized" });
  }
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json({ message: "Order deleted successfully" });
  } catch (error: any) {
     res.status(500).json({ error: error.message });
  }
};

export const createOrderFromCart = async (req: AuthRequest, res: Response) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(500).json({ error: "Database not connected. Please try again later." });
  }

  if (!req.user) {
    console.log("[CreateOrder] Failed: Unauthorized request");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { payment_reference, shippingDetails } = req.body;

  console.log(`[CreateOrder] Processing for user: ${req.user.id}, Ref: ${payment_reference}`);
  
  let orderStatus: 'PAID' | 'PENDING_VERIFICATION' = 'PAID';
  let isVerified = false;
  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

  // SKIP verification if this is a demo reference from the frontend simulation
  const isDemo = payment_reference && String(payment_reference).startsWith('DEMO-');

  if (PAYSTACK_SECRET_KEY && !isDemo) {
    try {
      // Verify that this reference hasn't been used already
      const existingOrder = await Order.findOne({ payment_reference });
      if (existingOrder) {
        console.warn(`[CreateOrder] Failed: Duplicate reference ${payment_reference} found for existing order ${existingOrder._id}.`);
        return res.status(400).json({ error: "Duplicate transaction reference. This payment has already been processed." });
      }

      console.log(`[CreateOrder] Attempting synchronous verification with Paystack for reference ${payment_reference}...`);
      // Calls Paystack API
      const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${payment_reference}`, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
      });
      const verifyData = await verifyRes.json() as any;

      if (!verifyData.status || verifyData.data.status !== 'success' || verifyData.data.amount < 1) { // amount < 1 check is important
        console.error(`[CreateOrder] Paystack synchronous verification failed for reference ${payment_reference}:`, verifyData);
        return res.status(400).json({ error: "Payment verification failed. Unable to create order." });
      }
      isVerified = true;
      console.log(`[CreateOrder] Paystack synchronous verification successful for reference ${payment_reference}.`);
    } catch (err: any) {
      console.warn(`[CreateOrder] Outgoing connection to Paystack failed/blocked for reference ${payment_reference}. Saving order as PENDING_VERIFICATION. Error: ${err.message}`);
      // Overcoming the block: We don't fail the request.
      // We save the order as PENDING_VERIFICATION and wait for the inbound webhook.
      orderStatus = 'PENDING_VERIFICATION';
      isVerified = false;
    }
  } else {
    console.log(`[CreateOrder] Skipping Paystack verification (Demo mode: ${isDemo} or No PAYSTACK_SECRET_KEY). Order status will be PAID.`);
    isVerified = true; // Treat as verified for demo/no-key scenarios
  }

  try {
    // Explicitly cast user ID for safety
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const shopper = await User.findById(req.user.id);
    if (!shopper) {
      console.error(`[CreateOrder] Shopper not found for ID: ${req.user.id}`);
      return res.status(404).json({ error: "Shopper not found" });
    }

    const cart = await Cart.findOne({ user: userId });

    if (!cart || !cart.items || cart.items.length === 0) {
      console.error(`[CreateOrder] Failed: Cart is empty for user ${req.user.id}.`);
      return res.status(400).json({ error: "Cart is empty" });
    }

    let total_amount = 0;
    const orderItems = [];

    console.log(`[CreateOrder] Processing ${cart.items.length} items from cart for user ${req.user.id}...`);

    for (const item of cart.items) {
      // Ensure we populate the vendor_id properly to get the vendor's name
      const product = await Product.findById(item.product).populate('vendor_id');
      if (!product || !product.vendor_id) {
        console.error(`[CreateOrder] Product not found or vendor_id missing for cart item: ${item.product}.`);
        // Decide how to handle this: skip item, or fail whole order. Failing whole order is safer.
        return res.status(400).json({ error: `Product not found or invalid for item ID: ${item.product}` });
      }

      const vendor = product.vendor_id as unknown as IUser;

      if (product.stock < item.quantity) {
        console.error(`[CreateOrder] Insufficient stock for product ${product.name} (ID: ${product._id}). Requested: ${item.quantity}, Available: ${product.stock}.`);
        return res.status(400).json({ error: `Insufficient stock for ${product.name}. Only ${product.stock} available.` });
      }

      orderItems.push({
        product_id: product._id,
        vendor_id: vendor._id,
        quantity: item.quantity,
        price: product.price,
        name: product.name,
        image_url: product.image_url,
        vendor_name: vendor.name || 'Vendor',
      });

      total_amount += product.price * item.quantity;
    }

    if (orderItems.length === 0) {
      return res.status(400).json({ error: "All items in your cart are no longer available." });
    }

    console.log(`[CreateOrder] Constructing Order object...`);

    const order = new Order({
      shopper_id: userId,
      shopper_name: shopper.name,
      shopper_email: shopper.email,
      total_amount, 
      payment_reference,
      status: orderStatus,
      shippingDetails: shippingDetails || {}, // Use the destructured variable
      items: orderItems
    });
    console.log(`[CreateOrder] Saving to database...`);
    const savedOrder = await order.save();
    console.log(`[CreateOrder] SUCCESS! Order ID: ${savedOrder._id}`);
    
    // Only perform activities if we successfully verified via outgoing call
    if (isVerified || isDemo) {
      console.log(`[CreateOrder] Activity: Updating product stocks...`);
      for (const item of orderItems) {
        await Product.findByIdAndUpdate(item.product_id, { $inc: { stock: -item.quantity } });
        console.log(`[CreateOrder] Stock decremented for Product: ${item.name} (${item.product_id}) by ${item.quantity}`);
      }

      if (shopper.email) {
        console.log(`[CreateOrder] Activity: Triggering confirmation email to ${shopper.email}`);
        sendOrderConfirmationEmail(shopper.email, savedOrder).catch(console.error);
      }

      // Only clear cart immediately if verified. Otherwise, the webhook handles it.
      await Cart.findOneAndDelete({ user: userId }).then(() => console.log(`[CreateOrder] Activity: Cart cleared for user ${userId}`)).catch(err => console.error("Failed to clear cart:", err));
    }

    res.status(201).json({ success: true, orderId: savedOrder._id });
  } catch (error: any) {
    console.error("Error creating order from cart:", error);
    res.status(500).json({ error: error.message });
  }
};
