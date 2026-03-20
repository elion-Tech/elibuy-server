import express from 'express';
import { 
  createOrder, 
  getMyOrders, 
  updateOrderStatus, 
  verifyPayment,
  getAllOrders,
  getOrderById,
  deleteOrder,
  calculateShipping,
} from '../controllers/orderController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Create Order Route
router.post('/', authenticateToken, createOrder);
router.post('/cost', calculateShipping);
router.get('/', authenticateToken, getAllOrders);
router.post('/verify', authenticateToken, verifyPayment);
router.get('/my', authenticateToken, getMyOrders);
router.get('/:id', authenticateToken, getOrderById);
router.patch('/:id/status', authenticateToken, updateOrderStatus);
router.delete('/:id', authenticateToken, deleteOrder);

export default router;
