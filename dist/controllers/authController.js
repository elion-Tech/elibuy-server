import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/mongooseModels.js';
export const signup = async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashedPassword, role: role || 'SHOPPER' });
        await user.save();
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
export const forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            // We don't want to reveal if a user exists or not
            return res.status(200).json({ message: 'If a user with that email exists, a password reset link has been sent.' });
        }
        // Generate token
        const resetToken = crypto.randomBytes(20).toString('hex');
        // Hash token and set to user
        user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        await user.save();
        // Create reset url
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
        // In a real app, you would email this URL to the user.
        // For this demo, we'll just log it and send it in the response for easy testing.
        console.log('Password Reset URL: ', resetUrl);
        res.status(200).json({ message: 'If a user with that email exists, a password reset link has been sent.' });
    }
    catch (error) {
        // Clear the token fields on error
        const user = await User.findOne({ email });
        if (user) {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpire = undefined;
            await user.save();
        }
        res.status(500).json({ error: 'Error sending reset email' });
    }
};
export const resetPassword = async (req, res) => {
    // Get hashed token
    const resetPasswordToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    try {
        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() }
        });
        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }
        // Set new password
        user.password = await bcrypt.hash(req.body.password, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();
        res.status(200).json({ message: 'Password reset successful. You can now log in.' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
export const login = async (req, res) => {
    const { email, password } = req.body;
    try {
        // Find user and explicitly include the password field
        const user = await User.findOne({ email }).select('+password');
        // **THE FIX**: Check if user exists AND if password exists before comparing.
        // This handles both "user not found" and "password field is missing" cases.
        if (!user || !user.password) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        // Now, `user.password` is guaranteed to be a string, satisfying bcrypt.
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role }
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
export const getMe = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
        const user = await User.findById(req.user.id);
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        res.json({ id: user._id, name: user.name, email: user.email, role: user.role });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
