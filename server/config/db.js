/**
 * db.js
 * Opens the MongoDB connection using Mongoose. Called once from server.js
 * when the app boots. If the connection fails, we exit immediately rather
 * than letting the server run with no database.
 */

const mongoose = require('mongoose');
const config = require('./config');

async function connectDB() {
  try {
    mongoose.set('strictQuery', true);
    const conn = await mongoose.connect(config.mongoUri);
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
    });
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
    });
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
