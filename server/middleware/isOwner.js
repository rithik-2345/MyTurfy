/**
 * middleware/isOwner.js
 * Runs AFTER protect() — blocks the request unless the logged-in
 * account is an owner. Stops a customer account from ever being able
 * to add/edit/delete venues, even if they guess the API endpoint.
 */

function isOwner(req, res, next) {
  if (!req.auth || req.auth.role !== 'owner') {
    return res.status(403).json({ success: false, message: 'This action is restricted to venue owners' });
  }
  next();
}

module.exports = isOwner;
