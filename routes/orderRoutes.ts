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
} from '../controllers/orderController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Order Operations
router.post('/', authenticateToken, createOrder); 
router.post('/from-cart', authenticateToken, createOrderFromCart); // Creates order from cart after payment
router.post('/verify', authenticateToken, verifyPayment);
router.get('/my', authenticateToken, getMyOrders); // Get logged-in user's orders
router.get('/:id', authenticateToken, getOrderById);
router.patch('/:id/status', authenticateToken, updateOrderStatus);

// Admin / Debug
router.get('/', authenticateToken, getAllOrders);
router.delete('/:id', authenticateToken, deleteOrder);
router.get('/debug', debugCheckDb); // New Debug Route (Public for testing)

export default router;
