const mongoose = require('mongoose');

mongoose.connect('mongodb+srv://Blu_org:Blu_org%40111@cluster0.k3b1l0r.mongodb.net/blulegacy?retryWrites=true&w=majority&appName=Cluster0')
.then(async () => {
  console.log('Connected to MongoDB');
  const db = mongoose.connection.db;
  
  try {
    const user = await db.collection('users').findOne({ userId: 'ADMIN001' });
    if (user) {
      await db.collection('boostingboards').updateMany({ ownerId: user._id }, { $set: { members: [] } });
      console.log('Admin board members cleared.');
    }
  } catch (e) {
    console.error('ERROR:', e);
  }
  process.exit(0);
});
