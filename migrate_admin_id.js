const mongoose = require('mongoose');

mongoose.connect('mongodb+srv://Blu_org:Blu_org%40111@cluster0.k3b1l0r.mongodb.net/blulegacy?retryWrites=true&w=majority&appName=Cluster0')
.then(async () => {
  console.log('Connected to MongoDB');
  const db = mongoose.connection.db;
  
  try {
    const admin = await db.collection('users').findOne({ userId: 'ADMIN001' });
    if (admin && typeof admin._id === 'string') {
      const oldId = admin._id;
      const newId = new mongoose.Types.ObjectId();
      
      console.log(`Migrating Admin from ${oldId} to ${newId}`);
      
      // Update User collection: since _id is immutable, we must insert and delete
      const newAdmin = { ...admin, _id: newId };
      await db.collection('users').deleteOne({ _id: oldId });
      await db.collection('users').insertOne(newAdmin);
      
      // Update Transactions
      const txRes = await db.collection('transactions').updateMany(
        { userId: oldId },
        { $set: { userId: newId } }
      );
      console.log(`Updated ${txRes.modifiedCount} admin transactions.`);
      
      // Update Logs
      const logRes = await db.collection('logs').updateMany(
        { userId: oldId },
        { $set: { userId: newId } }
      );
      console.log(`Updated ${logRes.modifiedCount} admin logs.`);
    } else {
      console.log('Admin _id is already an ObjectId or Admin not found.');
    }
    
    console.log('Migration successful!');
  } catch (e) {
    console.error('ERROR:', e);
  }
  process.exit(0);
});
