const mongoose = require('mongoose');

mongoose.connect('mongodb+srv://Blu_org:Blu_org%40111@cluster0.k3b1l0r.mongodb.net/blulegacy?retryWrites=true&w=majority&appName=Cluster0')
.then(async () => {
  console.log('Connected to MongoDB');
  const db = mongoose.connection.db;
  
  try {
    const nonAdmins = await db.collection('users').find({ role: { $ne: 'admin' } }).toArray();
    const nonAdminIds = nonAdmins.map(u => u._id);
    
    console.log(`Found ${nonAdmins.length} non-admin users to delete.`);
    
    const r1 = await db.collection('users').deleteMany({ role: { $ne: 'admin' } });
    const r2 = await db.collection('transactions').deleteMany({ userId: { $in: nonAdminIds } });
    const r3 = await db.collection('boostingboards').deleteMany({ ownerId: { $in: nonAdminIds } });
    const r4 = await db.collection('withdrawals').deleteMany({ userId: { $in: nonAdminIds } });
    const r5 = await db.collection('logs').deleteMany({ userId: { $in: nonAdminIds } });
    
    console.log(`Deleted ${r1.deletedCount} users.`);
    console.log(`Deleted ${r2.deletedCount} transactions.`);
    console.log(`Deleted ${r3.deletedCount} boosting boards.`);
    console.log(`Deleted ${r4.deletedCount} withdrawals.`);
    console.log(`Deleted ${r5.deletedCount} logs.`);
    
    console.log('All non-admin data successfully cleared!');
  } catch (e) {
    console.error('ERROR:', e);
  }
  process.exit(0);
});
