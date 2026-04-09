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
  if (!secret) return res.sendStatus(200);

  const signature = req.headers['x-paystack-signature'];
  // Paystack signature verification ensures the request is authentic
  const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(req.body)).digest('hex');

  if (hash !== signature) {
    console.error("[Webhook] Security Alert: Signature mismatch");
    return res.sendStatus(400);
  }

  const event = req.body;
  console.log(`[Webhook] Received Paystack event: ${event.event}`);

  if (event.event === 'charge.success') {
    const { reference } = event.data;
    const order = await Order.findOne({ payment_reference: reference });

    // Only process if the order was waiting for verification
    if (order && order.status === 'PENDING_VERIFICATION') {
      console.log(`[Webhook] Confirming payment for order: ${order._id}`);
      order.status = 'PAID';
      await order.save();

      // Post-payment activities (Now handled since we couldn't do it in the controller)
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product_id, { $inc: { stock: -item.quantity } });
        console.log(`[Webhook] Stock decremented for Product: ${item.name}`);
      }

      if (order.shopper_email) {
        sendOrderConfirmationEmail(order.shopper_email, order).catch(console.error);
      }
    }
  }
  res.sendStatus(200);
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

  const { payment_reference, shippingDetails } = req.body; // Destructure shippingDetails for clarity

  console.log(`[CreateOrder] Processing for user: ${req.user.id}, Ref: ${payment_reference}`);
  
  let orderStatus = 'PAID';
  let isVerified = false;

  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

  // SKIP verification if this is a demo reference from the frontend simulation
  const isDemo = payment_reference && String(payment_reference).startsWith('DEMO-');

  if (PAYSTACK_SECRET_KEY && !isDemo) {
    try {
      // Verify that this reference hasn't been used already
      const existingOrder = await Order.findOne({ payment_reference });
      if (existingOrder) {
        console.warn(`[CreateOrder] Failed: Duplicate reference ${payment_reference}`);
        return res.status(400).json({ error: "Duplicate transaction reference." });
      }

      console.log(`[CreateOrder] Verifying with Paystack...`);
      // Calls Paystack API
      const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${payment_reference}`, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
      });
      const verifyData = await verifyRes.json() as any;

      if (!verifyData.status || verifyData.data.status !== 'success' || verifyData.data.amount < 1) {
        console.error(`[CreateOrder] Paystack verification failed:`, verifyData);
        return res.status(400).json({ error: "Payment verification failed. Unable to create order." });
      }
      isVerified = true;
      console.log(`[CreateOrder] Paystack verification successful.`);
    } catch (err: any) {
      console.warn("[CreateOrder] Outgoing connection to Paystack failed/blocked. Falling back to Async Webhook.");
      // Overcoming the block: We don't fail the request.
      // We save the order as PENDING_VERIFICATION and wait for the inbound webhook.
      orderStatus = 'PENDING_VERIFICATION';
      isVerified = false;
    }
  } else {
    console.log(`[CreateOrder] Skipping Paystack verification (Demo mode or No Key).`);
  }

  try {
    // Explicitly cast user ID for safety
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const shopper = await User.findById(req.user.id);
    if (!shopper) return res.status(404).json({ error: "Shopper not found" });

    const cart = await Cart.findOne({ user: userId });

    if (!cart || !cart.items || cart.items.length === 0) {
      console.log(`[CreateOrder] Failed: Cart is empty for user ${req.user.id}`);
      return res.status(400).json({ error: "Cart is empty" });
    }

    let total_amount = 0;
    const orderItems = [];

    console.log(`[CreateOrder] Processing ${cart.items.length} items...`);

    for (const item of cart.items) {
      // Ensure we populate the vendor_id properly to get the vendor's name
      const product = await Product.findById(item.product).populate('vendor_id');
      if (!product || !product.vendor_id) {
        console.warn(`[CreateOrder] Product not found for item:`, item);
        continue;
      }

      const vendor = product.vendor_id as unknown as IUser;

      if (product.stock < item.quantity) {
        console.warn(`[CreateOrder] Stock error for ${product.name}`);
        return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
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
    }

    await Cart.findOneAndDelete({ user: userId }).then(() => console.log(`[CreateOrder] Activity: Cart cleared for user ${userId}`)).catch(err => console.error("Failed to clear cart:", err));

    res.status(201).json({ success: true, orderId: savedOrder._id });
  } catch (error: any) {
    console.error("Error creating order from cart:", error);
    res.status(500).json({ error: error.message });
  }
};
