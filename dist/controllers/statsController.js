import { User, Product, Order } from '../models/mongooseModels.js';
import mongoose from 'mongoose';
export const getStats = async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(500).json({ error: "Database not connected." });
    }
    if (!req.user)
        return res.status(401).json({ error: "Unauthorized" });
    const role = req.user.role;
    const userId = req.user.id;
    let stats = {};
    try {
        if (role === 'ADMIN') {
            stats.totalUsers = await User.countDocuments();
            stats.totalVendors = await User.countDocuments({ role: 'VENDOR' });
            stats.totalOrders = await Order.countDocuments();
            const revenue = await Order.aggregate([
                { $match: { status: { $ne: 'CANCELLED' } } },
                { $group: { _id: null, total: { $sum: '$total_amount' } } }
            ]);
            stats.totalRevenue = revenue[0]?.total || 0;
        }
        else if (role === 'VENDOR') {
            stats.myProducts = await Product.countDocuments({ vendor_id: userId });
            const vendorProducts = await Product.find({ vendor_id: userId }).select('_id');
            const productIds = vendorProducts.map(p => p._id);
            stats.myOrders = await Order.countDocuments({ 'items.product_id': { $in: productIds } });
            const revenue = await Order.aggregate([
                { $match: { 'items.product_id': { $in: productIds }, status: { $ne: 'CANCELLED' } } },
                { $unwind: '$items' },
                { $match: { 'items.product_id': { $in: productIds } } },
                { $group: { _id: null, total: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } }
            ]);
            stats.myRevenue = revenue[0]?.total || 0;
        }
        else if (role === 'LOGISTICS') {
            stats.pendingDeliveries = await Order.countDocuments({ status: { $in: ['PAID', 'PROCESSING', 'SHIPPED'] } });
            stats.completedDeliveries = await Order.countDocuments({ status: 'DELIVERED' });
        }
        res.json(stats);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
