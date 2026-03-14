import mongoose, { Schema, Document } from 'mongoose';
import { User as UserType, Product as ProductType, Order as OrderType } from './types.js';

export interface IUser extends Document, Omit<UserType, 'id'> {
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
}
export interface IProduct extends Document, Omit<ProductType, 'id' | 'vendor_id'> {
  vendor_id: mongoose.Types.ObjectId;
}
export interface IOrder extends Document, Omit<OrderType, 'id' | 'shopper_id'> {
  shopper_id: mongoose.Types.ObjectId;
  shippingDetails?: {
    state?: string;
    lga?: string;
    streetAddress?: string;
  };
  items: {
    product_id: mongoose.Types.ObjectId;
    quantity: number;
    price: number;
  }[];
}

const userSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['ADMIN', 'VENDOR', 'SHOPPER', 'LOGISTICS'], required: true },
  resetPasswordToken: { type: String },
  resetPasswordExpire: { type: Date },
}, { timestamps: true });

const productSchema = new Schema<IProduct>({
  vendor_id: { type: Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  image_url: { type: String },
  category: { type: String },
}, { timestamps: true });

const orderSchema = new Schema<IOrder>({
  shopper_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
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
    price: { type: Number, required: true }
  }]
}, { timestamps: true });

export const User = mongoose.model<IUser>('User', userSchema);
export const Product = mongoose.model<IProduct>('Product', productSchema);
export const Order = mongoose.model<IOrder>('Order', orderSchema);
