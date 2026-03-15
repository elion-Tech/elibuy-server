import express from 'express';
import { 
  signup, 
  login,
  forgotPassword,
  resetPassword,
  getMe
} from '../controllers/authController.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', resetPassword);
router.get('/me', auth, getMe);

export default router;
