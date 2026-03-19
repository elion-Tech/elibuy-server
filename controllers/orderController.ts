import { Request, Response } from 'express';
import { Order, Product, User, IProduct, IUser } from '../models/mongooseModels.js';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth.js'; 
import { sendOrderConfirmationEmail } from './emailUtil.js';

export const createOrder = async (req: AuthRequest, res: Response) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(500).json({ error: "Database not connected." });
  }

  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  
  const shopper = await User.findById(req.user.id);
  if (!shopper) return res.status(404).json({ error: "Shopper not found" });

  const { items, total_amount, payment_reference, shippingDetails } = req.body; 

  console.log(`[Order] Creating order for user ${req.user.id}. Ref: ${payment_reference}`);

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "No items provided" });
  }

  try {
    // Sanitize and validate items
    const orderItems = await Promise.all(items.map(async (item: any) => {
      const productId = item.product_id || item.id;
      const product = await Product.findById(productId).populate('vendor_id');
      
      if (!product) throw new Error(`Product not found: ${productId}`);

      const vendor = product.vendor_id as unknown as IUser;

      return {
        product_id: product._id,
        quantity: Number(item.quantity),
        price: Number(item.price),
        name: product.name,
        image_url: product.image_url,
        vendor_name: vendor?.name,
        size: item.size
      };
    }));

    // Check for invalid numbers
    if (orderItems.some((item: any) => isNaN(item.quantity) || isNaN(item.price))) {
      throw new Error("Invalid item data: quantity, price, or product_id missing/invalid");
    }

    const order = new Order({
      shopper_id: req.user.id,
      shopper_name: shopper.name,
      shopper_email: shopper.email,
      total_amount: Number(total_amount),
      payment_reference,
      status: 'PAID',
      shippingDetails: shippingDetails || {}, // Save shipping details
      items: orderItems
    });
    await order.save();
    console.log(`[Order] Order saved successfully: ${order._id}`);

    // Update product stock
    for (const item of orderItems) {
      try {
        await Product.findByIdAndUpdate(item.product_id, { $inc: { stock: -item.quantity } });
      } catch (err) {
        console.error(`Failed to update stock for product ${item.product_id}:`, err);
      }
    }

    // Send confirmation email
    try {
      if (shopper && shopper.email) {
        sendOrderConfirmationEmail(shopper.email, order).catch((err: any) => console.error("Failed to send email:", err));
      }
    } catch (err) {
      console.error("Failed to fetch user for email:", err);
    }

    res.status(201).json({ orderId: order._id });
  }  catch (error: any) {
    console.error("Error creating order:", error);
    if (error.name === 'ValidationError') {
      console.error("Validation Details:", JSON.stringify(error.errors, null, 2));
    }
    res.status(400).json({ error: error.message });
  }
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

// Geopolitical Zones in Nigeria
const ZONES: { [key: string]: string } = {
  'Benue': 'northCentral', 'Kogi': 'northCentral', 'Kwara': 'northCentral', 'Nasarawa': 'northCentral', 'Niger': 'northCentral', 'Plateau': 'northCentral', 'FCT': 'northCentral', 'Abuja': 'northCentral',
  'Adamawa': 'northEast', 'Bauchi': 'northEast', 'Borno': 'northEast', 'Gombe': 'northEast', 'Taraba': 'northEast', 'Yobe': 'northEast',
  'Jigawa': 'northWest', 'Kaduna': 'northWest', 'Kano': 'northWest', 'Katsina': 'northWest', 'Kebbi': 'northWest', 'Sokoto': 'northWest', 'Zamfara': 'northWest',
  'Abia': 'southEast', 'Anambra': 'southEast', 'Ebonyi': 'southEast', 'Enugu': 'southEast', 'Imo': 'southEast',
  'Akwa Ibom': 'southSouth', 'Bayelsa': 'southSouth', 'Cross River': 'southSouth', 'Delta': 'southSouth', 'Edo': 'southSouth', 'Rivers': 'southSouth',
  'Ekiti': 'southWest', 'Lagos': 'southWest', 'Ogun': 'southWest', 'Ondo': 'southWest', 'Osun': 'southWest', 'Oyo': 'southWest'
};

export const calculateShipping = async (req: Request, res: Response) => {
  const { state, items } = req.body;
  
  if (!state || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(200).json({ shippingCost: 0 });
  }

  // Case-insensitive lookup
  const normalizedState = state.trim().toLowerCase();

  if (normalizedState === 'international') {
    return res.status(200).json({ shippingCost: 0, isInternational: true });
  }

  const zoneKey = Object.keys(ZONES).find(k => k.toLowerCase() === normalizedState);
  const destinationZone = zoneKey ? ZONES[zoneKey] : undefined;

  // If destination is not a valid Nigerian state and not international, it's an error.
  if (!destinationZone) {
    return res.status(400).json({ error: 'Wrong state inputted' });
  }

  try {
    // Group items by vendor
    const vendorItems: { [key: string]: any[] } = {};
    
    // We need to fetch product details to get vendor_id and potential overrides
    for (const item of items) {
      const product = await Product.findById(item.product_id || item.id);
      if (product) {
        const vId = product.vendor_id.toString();
        if (!vendorItems[vId]) vendorItems[vId] = [];
        vendorItems[vId].push({ ...item, product });
      }
    }

    let totalShipping = 0;

    for (const vendorId in vendorItems) {
      const vItems = vendorItems[vendorId];
      const vendor = await User.findById(vendorId);
      
      if (!vendor || !vendor.vendorSettings || !vendor.vendorSettings.state) {
        // Fallback if vendor hasn't set up logistics: default modest fee or 0
        totalShipping += 1500; 
        continue;
      }

      const vendorState = vendor.vendorSettings.state;
      const logistics = vendor.vendorSettings.logistics;

      // 1. Calculate Standard Shipping for this vendor (applied once per vendor order)
      let vendorShippingCost = 0;
      
      if (vendorState === state) {
        vendorShippingCost = logistics?.sameState || 0;
      } else {
        // @ts-ignore
        vendorShippingCost = logistics?.[destinationZone] || 0;
      }

      // 2. Check for Product Level Overrides
      // Logic: If a product has an override, we add that SPECIFIC cost. 
      // If ANY product in the bundle does NOT have an override, we must charge the Base Vendor Rate.
      // If ALL products have overrides, we MIGHT strip the base rate, but usually base rate implies "delivery trip". 
      // To keep it functional: Base Rate + Sum(Overrides).
      
      let hasStandardProducts = false;

      for (const vItem of vItems) {
        if (vItem.product.shippingCost && vItem.product.shippingCost > 0) {
          totalShipping += (vItem.product.shippingCost * vItem.quantity);
        } 
      }
      
      totalShipping += vendorShippingCost;
    }

    res.json({ shippingCost: totalShipping });
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
      const vendorId = req.user.id; // Capture ID to avoid undefined error in callback
      isVendorForOrder = order.items.some(item => {
        // Fix TS2352: Double cast to unknown first to handle ObjectId -> IProduct conversion
        const product = item.product_id as unknown as IProduct;
        return product.vendor_id.toString() === vendorId;
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
