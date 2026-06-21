const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/blulegacy').then(async () => {
  const db = mongoose.connection.db;
  const users = await db.collection('users').find({ registrationDate: { $exists: false } }).toArray();
  for (let u of users) {
    await db.collection('users').updateOne({ _id: u._id }, { $set: { registrationDate: new Date() }});
  }
  console.log(`Fixed ${users.length} users missing registrationDate in DB.`);
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
