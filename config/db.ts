import mongoose from "mongoose";
import dotenv from "dotenv";
import { User, Product, Order } from "../models/mongooseModels.js";
import bcrypt from "bcryptjs";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

export const connectDB = async () => {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI is not defined in environment variables.");
    return;
  }

  try {
    console.log("Attempting to connect to MongoDB...");
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("Connected to MongoDB successfully");
    
    // Seed Data if empty
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log("Seeding initial data...");
      const hashedPassword = await bcrypt.hash("admin123", 10);
      const admin = new User({
        name: 'Admin User',
        email: 'admin@elibuy.com',
        password: hashedPassword,
        role: 'ADMIN'
      });
      await admin.save();

      const productData = [
        {
          name: 'Premium Wireless Headphones',
          description: 'High-quality sound with noise cancellation.',
          price: 45000,
          stock: 10,
          image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800',
          category: 'Electronics'
        },
        {
          name: 'Smart Watch Series 7',
          description: 'Track your health and fitness in style.',
          price: 120000,
          stock: 5,
          image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800',
          category: 'Electronics'
        },
        {
          name: 'Minimalist Leather Wallet',
          description: 'Genuine leather with RFID protection.',
          price: 15000,
          stock: 20,
          image_url: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800',
          category: 'Fashion'
        },
        {
          name: 'Organic Coffee Beans',
          description: 'Freshly roasted arabica beans.',
          price: 8500,
          stock: 50,
          image_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=800',
          category: 'Home'
        }
      ];
      const productsWithVendor = productData.map(p => ({ ...p, vendor_id: admin._id }));
      await Product.insertMany(productsWithVendor);
      console.log("Seeding completed.");
    }

    // Seed Orders if empty
    const orderCount = await Order.countDocuments();
    if (orderCount === 0) {
      console.log("Seeding initial orders...");
      const shopper = await User.findOne({ role: 'ADMIN' });
      const products = await Product.find().limit(2);

      if (shopper && products.length >= 2) {
        const orderData = [
          {
            shopper_id: shopper._id,
            shopper_name: shopper.name,
            shopper_email: shopper.email,
            total_amount: products[0].price * 2,
            status: 'PAID',
            payment_reference: 'seed-ref-1',
            shippingDetails: {
              state: 'Lagos',
              lga: 'Ikeja',
              streetAddress: '123 Test St'
            },
            items: [
              {
                product_id: products[0]._id,
                vendor_id: products[0].vendor_id,
                quantity: 2,
                price: products[0].price,
                name: products[0].name,
                vendor_name: 'Admin Vendor'
              }
            ]
          },
          {
            shopper_id: shopper._id,
            shopper_name: shopper.name,
            shopper_email: shopper.email,
            total_amount: products[1].price * 1,
            status: 'PENDING',
            payment_reference: 'seed-ref-2',
            shippingDetails: {
              state: 'Abuja',
              lga: 'AMAC',
              streetAddress: '456 Sample Rd'
            },
            items: [
              {
                product_id: products[1]._id,
                vendor_id: products[1].vendor_id,
                quantity: 1,
                price: products[1].price,
                name: products[1].name,
                vendor_name: 'Admin Vendor'
              }
            ]
          }
        ];
        await Order.insertMany(orderData);
        console.log("Order seeding completed.");
      }
    }
  } catch (error: any) {
    console.error("MongoDB connection error details:");
    console.error("Message:", error.message);
    console.error("Code:", error.code);
    if (error.message.includes('authentication failed')) {
      console.error("TIP: Check if your password is correct and doesn't contain unencoded special characters.");
    }
    if (error.message.includes('querySrv ETIMEOUT') || error.message.includes('querySrv ENOTFOUND')) {
      console.error("TIP: Check if your cluster address is correct.");
    }
  }
};

export default mongoose.connection;
