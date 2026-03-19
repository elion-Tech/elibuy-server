import mongoose, { Schema, Document } from 'mongoose';
import { User as UserType, Product as ProductType, Order as OrderType } from './types.js';

export interface IUser extends Document, Omit<UserType, 'id'> {
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
  vendorSettings?: {
    state?: string;
    logistics?: {
      sameState?: number;
      northCentral?: number;
      northEast?: number;
      northWest?: number;
      southEast?: number;
      southSouth?: number;
      southWest?: number;
    }
  };
}
export interface IProduct extends Document, Omit<ProductType, 'id' | 'vendor_id'> {
  shippingCost?: number; // Optional override
  vendor_id: mongoose.Types.ObjectId;
}
export interface IOrder extends Document, Omit<OrderType, 'id' | 'shopper_id'> {
  shopper_id: mongoose.Types.ObjectId;
  shopper_name?: string;
  shopper_email?: string;
  shippingDetails?: {
    state?: string;
    lga?: string;
    streetAddress?: string;
  };
  items: {
    product_id: mongoose.Types.ObjectId;
    quantity: number;
    price: number;
    name?: string;
    image_url?: string;
    vendor_name?: string;
    size?: string;
  }[];
}

const userSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['ADMIN', 'VENDOR', 'SHOPPER', 'LOGISTICS'], required: true },
  resetPasswordToken: { type: String },
  resetPasswordExpire: { type: Date },
  vendorSettings: {
    state: { type: String },
    logistics: {
      sameState: { type: Number, default: 0 },
      northCentral: { type: Number, default: 0 },
      northEast: { type: Number, default: 0 },
      northWest: { type: Number, default: 0 },
      southEast: { type: Number, default: 0 },
      southSouth: { type: Number, default: 0 },
      southWest: { type: Number, default: 0 }
    }
  }
}, { timestamps: true });

const productSchema = new Schema<IProduct>({
  vendor_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  image_url: { type: String },
  shippingCost: { type: Number }, // Product-specific override
  category: { type: String },
}, { timestamps: true });

const orderSchema = new Schema<IOrder>({
  shopper_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  shopper_name: { type: String },
  shopper_email: { type: String },
  total_amount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'], 
    default: 'PENDING' 
  },
  payment_reference: { type: String },
  shippingDetails: {
    state: { type: String },
    lga: { type: String },
    streetAddress: { type: String }
  },
  items: [{
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    name: { type: String },
    image_url: { type: String },
    vendor_name: { type: String },
    size: { type: String }
  }]
}, { timestamps: true });

export const User = mongoose.model<IUser>('User', userSchema);
export const Product = mongoose.model<IProduct>('Product', productSchema);
export const Order = mongoose.model<IOrder>('Order', orderSchema);
