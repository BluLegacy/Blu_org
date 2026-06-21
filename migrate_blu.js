require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://Blu_org:Blu_org%40111@cluster0.k3b1l0r.mongodb.net/blulegacy?retryWrites=true&w=majority&appName=Cluster0');
  
  // Create schemas if not exported
  const UserSchema = new mongoose.Schema({ _id: mongoose.Schema.Types.Mixed }, { strict: false });
  const User = mongoose.model('User', UserSchema);
  
  const TransactionSchema = new mongoose.Schema({ _id: mongoose.Schema.Types.Mixed }, { strict: false });
  const Transaction = mongoose.model('Transaction', TransactionSchema);

  const NotificationSchema = new mongoose.Schema({ _id: mongoose.Schema.Types.Mixed }, { strict: false });
  const Notification = mongoose.model('Notification', NotificationSchema);
  
  const users = await User.find({});
  let count = 0;
  for (let u of users) {
    let changed = false;
    if (u.get('userId') && u.get('userId').startsWith('TRON')) {
      u.set('userId', u.get('userId').replace('TRON', 'BLU'));
      changed = true;
    }
    if (u.get('referralCode') && u.get('referralCode').startsWith('TRON')) {
      u.set('referralCode', u.get('referralCode').replace('TRON', 'BLU'));
      changed = true;
    }
    if (u.get('parentReferral') && u.get('parentReferral').startsWith('TRON')) {
      u.set('parentReferral', u.get('parentReferral').replace('TRON', 'BLU'));
      changed = true;
    }
    if (changed) {
      await u.save();
      count++;
    }
  }
  console.log(`Updated ${count} users.`);

  const txs = await Transaction.find({});
  let txCount = 0;
  for (let t of txs) {
    let tChanged = false;
    if (t.get('note') && t.get('note').includes('TRON')) {
      t.set('note', t.get('note').replace(/TRON/g, 'BLU'));
      tChanged = true;
    }
    if (tChanged) {
      await t.save();
      txCount++;
    }
  }
  console.log(`Updated ${txCount} transactions.`);

  const notifs = await Notification.find({});
  let notifCount = 0;
  for (let n of notifs) {
    if (n.get('message') && n.get('message').includes('TRON')) {
      n.set('message', n.get('message').replace(/TRON/g, 'BLU'));
      await n.save();
      notifCount++;
    }
  }
  console.log(`Updated ${notifCount} notifications.`);

  console.log("Migration complete.");
  process.exit(0);
}
migrate();
