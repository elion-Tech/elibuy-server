import { Cart } from '../models/mongooseModels.js';
import { Request, Response } from 'express';

/**
 * Get user's cart. If no cart exists, create an empty one.
 */
export const getCart = async (req: Request, res: Response) => {
  try {
    const cart = await Cart.findOne({ user: (req as any).user.id }).populate({
      path: 'items.product',
      model: 'Product'
    });

    if (!cart) {
      const newCart = await Cart.create({ user: (req as any).user.id, items: [] });
      return res.json(newCart);
    }
    res.json(cart);
  } catch (error: any) {
    res.status(500).json({ error: 'Server Error: ' + error.message });
  }
};

/**
 * Merge a local cart (from guest session) into the server cart.
 */
export const mergeCart = async (req: Request, res: Response) => {
  const { items } = req.body; // Expecting { items: [{ productId, quantity }] }
  const userId = (req as any).user.id;

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Invalid items array' });
  }

  try {
    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = await Cart.create({ user: userId, items: [] });
    }

    for (const item of items) {
      const existingItemIndex = cart.items.findIndex((cartItem: any) => cartItem.product.toString() === item.productId);
      if (existingItemIndex > -1) {
        cart.items[existingItemIndex].quantity += item.quantity;
      } else {
        cart.items.push({ product: item.productId, quantity: item.quantity } as any);
      }
    }

    await cart.save();
    res.status(200).json({ message: 'Cart merged successfully' });
  } catch (error: any) {
    res.status(500).json({ error: 'Server Error: ' + error.message });
  }
};

/**
 * Add an item to the cart. If the item already exists, update its quantity.
 */
export const addItemToCart = async (req: Request, res: Response) => {
  const { productId, quantity = 1 } = req.body;
  const userId = (req as any).user.id;

  if (!productId || quantity < 1) {
    return res.status(400).json({ error: 'Invalid request: requires productId and quantity.' });
  }

  try {
    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      cart = await Cart.create({ user: userId, items: [] });
    }

    const itemIndex = cart.items.findIndex((item: any) => item.product.toString() === productId);

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity += quantity;
    } else {
      cart.items.push({ product: productId as any, quantity });
    }

    await cart.save();
    await cart.populate({ path: 'items.product', model: 'Product' });
    res.status(200).json(cart);
  } catch (error: any) {
    res.status(500).json({ error: 'Server Error: ' + error.message });
  }
};

/**
 * Update the quantity of a specific item in the cart.
 */
export const updateCartItem = async (req: Request, res: Response) => {
  const { productId } = req.params;
  const { quantity } = req.body;
  const userId = (req as any).user.id;

  if (!quantity || quantity < 1) {
    return res.status(400).json({ error: 'Quantity must be at least 1.' });
  }

  try {
    const cart = await Cart.findOneAndUpdate(
      { user: userId, 'items.product': productId },
      { $set: { 'items.$.quantity': quantity } },
      { returnDocument: 'after' }
    ).populate({ path: 'items.product', model: 'Product' });

    if (!cart) {
      return res.status(404).json({ error: 'Item not found in cart.' });
    }
    res.status(200).json(cart);
  } catch (error: any) {
    res.status(500).json({ error: 'Server Error: ' + error.message });
  }
};

/**
 * Remove an item completely from the cart.
 */
export const removeCartItem = async (req: Request, res: Response) => {
  const { productId } = req.params;
  const userId = (req as any).user.id;

  try {
    const cart = await Cart.findOneAndUpdate(
      { user: userId },
      { $pull: { items: { product: productId } } },
      { returnDocument: 'after' }
    ).populate({ path: 'items.product', model: 'Product' });

    if (!cart) {
      return res.status(404).json({ error: 'Cart not found.' });
    }
    res.status(200).json(cart);
  } catch (error: any) {
    res.status(500).json({ error: 'Server Error: ' + error.message });
  }
};

/**
 * Clear all items from the cart.
 */
export const clearCart = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  try {
    await Cart.findOneAndUpdate({ user: userId }, { $set: { items: [] } });
    res.status(200).json({ message: 'Cart cleared successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: 'Server Error: ' + error.message });
  }
};