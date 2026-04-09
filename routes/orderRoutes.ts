import express from 'express';
import { 
  createOrder, 
  getMyOrders, 
  updateOrderStatus, 
  getAllOrders,
  getOrderById,
  deleteOrder,
  debugCheckDb,
  createOrderFromCart,
  verifyPayment,
  handlePaystackWebhook
} from '../controllers/orderController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Order Operations
router.post('/', authenticateToken, createOrder); 
router.post('/from-cart', authenticateToken, createOrderFromCart); // Creates order from cart after payment
router.post('/verify', authenticateToken, verifyPayment);
router.post('/webhook', handlePaystackWebhook); // Public endpoint for Paystack notifications
router.get('/my', authenticateToken, getMyOrders); // Get logged-in user's orders
router.get('/debug', debugCheckDb); // Static routes must come before dynamic /:id to avoid 404 shadowing
router.get('/:id', authenticateToken, getOrderById);
router.patch('/:id/status', authenticateToken, updateOrderStatus);

// Admin / Debug
router.get('/', authenticateToken, getAllOrders);
router.delete('/:id', authenticateToken, deleteOrder);

export default router;
