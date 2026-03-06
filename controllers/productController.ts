import { Request, Response } from 'express';
import { Product } from '../models/mongooseModels.js';
import { AuthRequest } from '../middleware/auth.js';
import mongoose from 'mongoose';

export const getAllProducts = async (req: Request, res: Response) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(500).json({ error: "Database not connected. Please check MONGODB_URI." });
  }
  try {
    const products = await Product.find();
    res.json(products.map(p => ({ ...p.toObject(), id: p._id.toString() })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createProduct = async (req: AuthRequest, res: Response) => {
  if (!req.user || (req.user.role !== 'VENDOR' && req.user.role !== 'ADMIN')) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  try {
    const { name, description, price, stock, image_url, category } = req.body;
    const product = new Product({
      vendor_id: req.user.id,
      name,
      description,
      price,
      stock,
      image_url,
      category
    });
    await product.save();
    res.status(201).json({ id: product._id });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
