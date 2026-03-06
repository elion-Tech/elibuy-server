import express from 'express';
import { getAllProducts, createProduct } from '../controllers/productController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getAllProducts);
router.post('/', authenticateToken, createProduct);

export default router;
