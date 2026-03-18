import express from 'express';
import { createOrder, getMyOrders, updateOrderStatus, verifyPayment

const router = express.Router();

router.post('/', authenticateToken, createOrder);
router.get('/', authenticateToken, getAllOrders);
router.post('/verify', authenticateToken, verifyPayment);
router.get('/my', authenticateToken, getMyOrders);
router.get('/:id', authenticateToken, getOrderById);
router.patch('/:id/status', authenticateToken, updateOrderStatus);
router.delete('/:id', authenticateToken, deleteOrder);

export default router;
