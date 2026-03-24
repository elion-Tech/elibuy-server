import express from 'express';
import { 
  createOrder, 
  getMyOrders, 
  updateOrderStatus, 
  getAllOrders,
  getOrderById,
  deleteOrder,
  calculateShipping,
  debugCheckDb,
} from '../controllers/orderController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Order Operations
router.post('/', authenticateToken, createOrder); // Creates order from Cart + Verifies Payment
router.post('/cost', calculateShipping); // Calculates shipping cost
router.get('/my', authenticateToken, getMyOrders); // Get logged-in user's orders
router.get('/:id', authenticateToken, getOrderById);
router.patch('/:id/status', authenticateToken, updateOrderStatus);

// Admin / Debug
router.get('/', authenticateToken, getAllOrders);
router.delete('/:id', authenticateToken, deleteOrder);
router.get('/debug', debugCheckDb); // New Debug Route (Public for testing)

export default router;
