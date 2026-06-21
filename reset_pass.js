require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function resetAdmin() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  // Create schema matching server.js
  const UserSchema = new mongoose.Schema({
    userId: String,
    password: String,
    txPassword: String
  }, { strict: false });
  const User = mongoose.model('User', UserSchema);

  const hash = await bcrypt.hash('123456', 10);
  
  await User.updateOne({ userId: 'ADMIN001' }, { $set: { password: hash, txPassword: '123' } });
  console.log("Admin password reset to: 123456");
  
  process.exit(0);
}

resetAdmin();
