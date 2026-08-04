/**
 * middleware/auth.js
 * Verifies the JWT on any request to a protected route. If valid, it
 * attaches req.auth = { id, role } so downstream route handlers know
 * WHO is calling and whether they're a 'user' (customer) or 'owner'.
 *
 * Usage in a route file (Part 2):
 *   router.post('/venues', protect, isOwner, createVenue);
 */

const jwt = require('jsonwebtoken');
const config = require('../config/config');

function protect(req, res, next) {
  let token;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret); // { id, role, iat, exp }
    req.auth = { id: decoded.id, role: decoded.role };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Not authorized, token invalid or expired' });
  }
}

module.exports = { protect };
