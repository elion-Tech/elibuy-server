import { Response } from 'express';
import { Order, Product } from '../models/mongooseModels.js';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth.js'; 
 
export const createOrder = async (req: AuthRequest, res: Response) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(500).json({ error: "Database not connected." });
  }

  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  
  const { items, total_amount, payment_reference, shippingDetails } = req.body; 
  try {
    const order = new Order({
      shopper_id: req.user.id,
      total_amount,
      payment_reference,
      status: 'PAID',
      shippingDetails, // Save shipping details
      items: items.map((item:any) => ({
        product_id: item.product_id || item.id,
        quantity: item.quantity,
        price: item.price
      }))
    });
    await order.save();
    res.status(201).json({ orderId: order._id });
  }  catch (error: any) {
    console.error("Error creating order:", error);
    res.status(400).json({ error: error.message });
  }
};

export const verifyPayment = async (req: AuthRequest, res: Response) => {
  const { reference } = req.body;
  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

  if (!PAYSTACK_SECRET_KEY) {
    // If no key, we just simulate success for the demo
    return res.json({ status: 'success', message: 'Payment verified (Simulated)' });
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
      orders = await Order.find({ shopper_id: req.user.id }).sort({ createdAt: -1 });
    } else if (req.user.role === 'VENDOR') {
      // Find orders that contain products belonging to this vendor
      const vendorProducts = await Product.find({ vendor_id: req.user.id }).select('_id');
      const productIds = vendorProducts.map(p => p._id);
      orders = await Order.find({ 'items.product_id': { $in: productIds } }).sort({ createdAt: -1 });
    } else {
      orders = await Order.find().sort({ createdAt: -1 });
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
