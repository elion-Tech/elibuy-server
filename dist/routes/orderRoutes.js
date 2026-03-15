import express from 'express';
import { createOrder, getMyOrders, updateOrderStatus, verifyPayment } from '../controllers/orderController.js';
import { authenticateToken } from '../middleware/auth.js';
const router = express.Router();
router.post('/', authenticateToken, createOrder);
router.post('/verify', authenticateToken, verifyPayment);
router.get('/my', authenticateToken, getMyOrders);
router.patch('/:id/status', authenticateToken, updateOrderStatus);
export default router;
