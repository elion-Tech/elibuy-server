import mongoose from "mongoose";
import dotenv from "dotenv";
import { User, Product } from "../models/mongooseModels.js";
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
