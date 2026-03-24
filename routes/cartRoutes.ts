import express from 'express';
import {
  getCart,
  addItemToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  mergeCart,
} from '../controllers/cartController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Protect all cart routes
router.use(authenticateToken);

// Get user's cart or clear it
router.route('/')
  .get(getCart)
  .delete(clearCart);

// Add, update, or remove a specific item
router.post('/items', addItemToCart);
router.put('/items/:productId', updateCartItem);
router.delete('/items/:productId', removeCartItem);

// Merge local cart into server cart
router.post('/merge', mergeCart);

export default router;