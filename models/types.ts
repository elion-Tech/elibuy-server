export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: 'ADMIN' | 'VENDOR' | 'SHOPPER' | 'LOGISTICS';
  created_at?: string;
}

export interface Product {
  id: string;
  vendor_id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  image_url: string;
  category: string;
}

export interface Order {
  id: string;
  shopper_id: string;
  total_amount: number;
  status: 'PENDING' | 'PAID' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'PENDING_VERIFICATION';
  payment_reference: string;
  shippingDetails: {
    state?: string;
    lga?: string;
    streetAddress?: string;
    phoneNumber?: string;
    city?: string;
  };
  items: {
    product_id: string;
    vendor_id: string;
    quantity: number;
    price: number;
    name?: string;
    image_url?: string;
    vendor_name?: string;
    size?: string;
  }[];
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  price: number;
}
