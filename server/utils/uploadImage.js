/**
 * utils/uploadImage.js
 * Uploads a single image buffer (received via multer) to Cloudinary and
 * returns the hosted URL. Multer handles receiving the file from the
 * browser in routes/venues.js — this file only handles the Cloudinary
 * side, so each piece stays easy to reason about on its own.
 */

const { v2: cloudinary } = require('cloudinary');
const config = require('../config/config');

const cloudinaryConfigured = !!(
  config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret
);

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
  });
}

/**
 * @param {Buffer} fileBuffer - raw file bytes from multer's memory storage
 * @returns {Promise<string>} the secure Cloudinary URL
 */
function uploadImageBuffer(fileBuffer) {
  if (!cloudinaryConfigured) {
    return Promise.reject(new Error('Cloudinary is not configured — add CLOUDINARY_* values to your .env'));
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'myturfy/venues', resource_type: 'image' },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(fileBuffer);
  });
}

/**
 * Extract public_id from Cloudinary URL and delete it from Cloudinary
 * @param {string} url - The full Cloudinary URL
 * @returns {Promise<void>}
 */
function deleteImageByUrl(url) {
  if (!cloudinaryConfigured || !url || !url.includes('res.cloudinary.com')) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    try {
      // URL format: https://res.cloudinary.com/cloudName/image/upload/v123456/folder/subfolder/public_id.ext
      const parts = url.split('/upload/');
      if (parts.length < 2) return resolve();
      
      // Remove the version number (e.g., v123456789/) if present
      let publicIdWithExt = parts[1];
      if (publicIdWithExt.startsWith('v')) {
        const slashIndex = publicIdWithExt.indexOf('/');
        if (slashIndex !== -1) {
          publicIdWithExt = publicIdWithExt.substring(slashIndex + 1);
        }
      }
      
      // Remove the extension (e.g., .jpg)
      const dotIndex = publicIdWithExt.lastIndexOf('.');
      const publicId = dotIndex !== -1 ? publicIdWithExt.substring(0, dotIndex) : publicIdWithExt;

      cloudinary.uploader.destroy(publicId, (err, result) => {
        if (err) {
          console.error(`⚠️ Cloudinary delete failed for publicId: ${publicId}`, err.message);
        } else {
          console.log(`🗑️ Cloudinary photo deleted: ${publicId} (Result: ${result?.result})`);
        }
        resolve();
      });
    } catch (err) {
      console.error('Error parsing Cloudinary URL for deletion:', err.message);
      resolve();
    }
  });
}

module.exports = { uploadImageBuffer, deleteImageByUrl, cloudinaryConfigured };
