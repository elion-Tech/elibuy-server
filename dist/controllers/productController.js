import { Product } from '../models/mongooseModels.js';
import mongoose from 'mongoose';
export const getAllProducts = async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(500).json({ error: "Database not connected. Please check MONGODB_URI." });
    }
    try {
        const products = await Product.find();
        res.json(products.map(p => ({ ...p.toObject(), id: p._id.toString() })));
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
export const getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ ...product.toObject(), id: product._id.toString() });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
export const createProduct = async (req, res) => {
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
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
export const updateProduct = async (req, res) => {
    if (!req.user || (req.user.role !== 'VENDOR' && req.user.role !== 'ADMIN')) {
        return res.status(403).json({ error: "Unauthorized" });
    }
    try {
        const { id } = req.params;
        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        // Vendor can only update their own products
        if (req.user.role === 'VENDOR' && product.vendor_id.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Forbidden: You can only update your own products' });
        }
        const updatedProduct = await Product.findByIdAndUpdate(id, req.body, { new: true });
        res.json({ ...updatedProduct?.toObject(), id: updatedProduct?._id.toString() });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
export const deleteProduct = async (req, res) => {
    if (!req.user || (req.user.role !== 'VENDOR' && req.user.role !== 'ADMIN')) {
        return res.status(403).json({ error: "Unauthorized" });
    }
    try {
        const { id } = req.params;
        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        // Vendor can only delete their own products
        if (req.user.role === 'VENDOR' && product.vendor_id.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Forbidden: You can only delete your own products' });
        }
        await Product.findByIdAndDelete(id);
        res.status(200).json({ message: 'Product deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
