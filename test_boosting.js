const mongoose = require('mongoose');

mongoose.connect('mongodb+srv://Blu_org:Blu_org%40111@cluster0.k3b1l0r.mongodb.net/blulegacy?retryWrites=true&w=majority&appName=Cluster0')
.then(async () => {
  console.log('Connected');
  const User = mongoose.model('User', new mongoose.Schema({ userId: String, name: String, email: String, isBoostingBlocked: Boolean }));
  const BoostingBoard = mongoose.model('BoostingBoard', new mongoose.Schema({ ownerId: mongoose.Schema.Types.ObjectId, isCycled: Boolean }));
  const Transaction = mongoose.model('Transaction', new mongoose.Schema({ userId: mongoose.Schema.Types.ObjectId, category: String, type: String, status: String, amount: Number }));
  
  try {
    const users = await User.find({}, 'userId name email isBoostingBlocked').lean();
    console.log('Users:', users.length);
    for (const u of users) {
      await BoostingBoard.countDocuments({ ownerId: u._id });
      await BoostingBoard.countDocuments({ ownerId: u._id, isCycled: true });
      await Transaction.find({ userId: u._id, category: 'BOOSTING_INCOME', type: 'credit', status: 'Approved' });
    }
    console.log('Success');
  } catch (e) {
    console.error('ERROR:', e);
  }
  process.exit(0);
});
