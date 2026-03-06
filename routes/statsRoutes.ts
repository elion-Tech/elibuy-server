import express from 'express';
import { getStats } from '../controllers/statsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, getStats);

export default router;
