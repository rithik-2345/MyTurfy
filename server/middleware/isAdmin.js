/**
 * middleware/isAdmin.js
 * Runs AFTER protect() — blocks the request unless the logged-in
 * account has the 'admin' role. Only the single hardcoded admin
 * account can ever hold this role.
 */

function isAdmin(req, res, next) {
  if (!req.auth || req.auth.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
}

module.exports = isAdmin;
