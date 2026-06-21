const mongoose = require('mongoose');
const fs = require('fs');

const URI = 'mongodb+srv://Blu_org:Blu_org%40111@cluster0.k3b1l0r.mongodb.net/blulegacy?retryWrites=true&w=majority&appName=Cluster0';

async function migrate() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(URI);
    console.log('Connected!');

    // Read local JSON
    console.log('Reading blulegacy_database.json...');
    const dbData = JSON.parse(fs.readFileSync('./blulegacy_database.json', 'utf8'));

    // Insert Users
    if (dbData.users && dbData.users.length > 0) {
      console.log(`Migrating ${dbData.users.length} users...`);
      const User = mongoose.connection.collection('users');
      await User.deleteMany({});
      // Ensure we keep the string _ids or map them safely
      const usersToInsert = dbData.users.map(u => {
        return u;
      });
      await User.insertMany(usersToInsert);
      console.log('Users migrated!');
    }

    // Insert Transactions
    if (dbData.transactions && dbData.transactions.length > 0) {
      console.log(`Migrating ${dbData.transactions.length} transactions...`);
      const Transaction = mongoose.connection.collection('transactions');
      await Transaction.deleteMany({});
      await Transaction.insertMany(dbData.transactions);
      console.log('Transactions migrated!');
    }

    // Insert Deposit Requests
    if (dbData.depositrequests && dbData.depositrequests.length > 0) {
      console.log(`Migrating ${dbData.depositrequests.length} deposit requests...`);
      const DepositReq = mongoose.connection.collection('depositrequests');
      await DepositReq.deleteMany({});
      for (const doc of dbData.depositrequests) {
        if (doc.receiptData && typeof doc.receiptData === 'string' && doc.receiptData.length > 1000000) {
          console.warn(`Truncating giant deposit receipt for request ${doc._id || 'unknown'}`);
          doc.receiptData = "TRUNCATED_DUE_TO_SIZE_LIMIT";
        }
        try {
          await DepositReq.insertOne(doc);
        } catch (err) {
          console.error(err);
        }
      }
      console.log('Deposit Requests migrated!');
    }

    // Insert Withdrawals
    if (dbData.withdrawals && dbData.withdrawals.length > 0) {
      console.log(`Migrating ${dbData.withdrawals.length} withdrawals...`);
      const Withdrawal = mongoose.connection.collection('withdrawals');
      await Withdrawal.deleteMany({});
      await Withdrawal.insertMany(dbData.withdrawals);
      console.log('Withdrawals migrated!');
    }

    // Insert Reward Claims
    if (dbData.rewardclaims && dbData.rewardclaims.length > 0) {
      console.log(`Migrating ${dbData.rewardclaims.length} reward claims...`);
      const RewardClaim = mongoose.connection.collection('rewardclaims');
      await RewardClaim.deleteMany({});
      await RewardClaim.insertMany(dbData.rewardclaims);
      console.log('Reward Claims migrated!');
    }

    // Insert Tickets
    if (dbData.tickets && dbData.tickets.length > 0) {
      console.log(`Migrating ${dbData.tickets.length} tickets...`);
      const Ticket = mongoose.connection.collection('tickets');
      await Ticket.deleteMany({});
      await Ticket.insertMany(dbData.tickets);
      console.log('Tickets migrated!');
    }

    // Insert Logs
    if (dbData.logs && dbData.logs.length > 0) {
      console.log(`Migrating ${dbData.logs.length} logs...`);
      const Log = mongoose.connection.collection('logs');
      await Log.deleteMany({});
      await Log.insertMany(dbData.logs);
      console.log('Logs migrated!');
    }

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
