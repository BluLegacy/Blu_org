require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const net = require('net');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
const helmet = require('helmet');
const compression = require('compression');

let mongoose = require('mongoose');

const app = express();
app.use(helmet({ contentSecurityPolicy: false })); // Disabled CSP so inline styles/scripts and CDNs don't break
app.use(compression());
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Self-ping to prevent Render inactivity sleep
app.get('/api/ping', (req, res) => res.status(200).send('OK'));
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    fetch(process.env.RENDER_EXTERNAL_URL + '/api/ping')
      .then(res => res.text())
      .catch(err => console.error("Self-ping error:", err.message));
  }, 10 * 60 * 1000); // Every 10 minutes
}

const PORT = process.env.PORT || 8080;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://Blu_org:Blu_org%40111@cluster0.k3b1l0r.mongodb.net/blulegacy?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(MONGODB_URI, { maxPoolSize: 10 }).catch(err => console.error("Mongoose connection error:", err));

const JWT_SECRET = process.env.JWT_SECRET || 'blulegacy_jwt_sec_token_9921';

// Enable larger base64 image uploads (up to 50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

// Serve static frontend files from Noida project root
app.use(express.static(__dirname));

// ==========================================================================
// ZERO-DEPENDENCY FILE-BASED PERSISTENT DATABASE FALLBACK
// ==========================================================================

let dbData = {
  users: [],
  transactions: [],
  withdrawals: [],
  tickets: [],
  notifications: [],
  logs: [],
  depositrequests: [],
    boostingboards: []
};

const DB_FILE = path.join(__dirname, 'blulegacy_database.json');

function loadLocalDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      dbData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } else {
      saveLocalDb();
    }
  } catch (e) {
    console.error("Local database load failed, starting fresh:", e.message);
  }
}

function saveLocalDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), 'utf8');
  } catch (e) {
    console.error("Local database save failed:", e.message);
  }
}

// Custom mock Mongoose implementation
const mockMongoose = {
  Schema: function(definition) {
    this.definition = definition;
  },
  model: function(modelName, schema) {
    const collectionName = modelName.toLowerCase() + 's';
    
    // Ensure array container exists
    if (!dbData[collectionName]) {
      dbData[collectionName] = [];
      saveLocalDb();
    }

    class MockModel {
      constructor(data) {
        Object.assign(this, data);
        if (!this._id) {
          this._id = "usr-" + Math.random().toString(36).substr(2, 9);
        }
        // Self-heal array definitions from the schema
        if (schema && schema.definition) {
          for (let key in schema.definition) {
            const fieldDef = schema.definition[key];
            if (Array.isArray(fieldDef) || (fieldDef && (fieldDef.type === Array || Array.isArray(fieldDef.type)))) {
              if (!this[key] || !Array.isArray(this[key])) {
                this[key] = [];
              }
            }
          }
        }
      }

      async save() {
        const list = dbData[collectionName];
        const idx = list.findIndex(item => item._id === this._id);
        if (idx !== -1) {
          list[idx] = JSON.parse(JSON.stringify(this));
        } else {
          list.push(JSON.parse(JSON.stringify(this)));
        }
        saveLocalDb();
        return this;
      }
    }

    MockModel.find = function(query = {}) {
      let list = dbData[collectionName];

      if (query && query.$or && Array.isArray(query.$or)) {
        list = list.filter(item => {
          return query.$or.some(q => {
            for (let key in q) {
              if (item[key] !== q[key]) return false;
            }
            return true;
          });
        });
      } else {
        list = list.filter(item => {
          for (let key in query) {
            const val = query[key];
            if (val && typeof val === 'object') {
              if (val instanceof RegExp) {
                if (!val.test(item[key])) return false;
              } else if ('$ne' in val) {
                if (item[key] === val['$ne']) return false;
              } else if ('$in' in val && Array.isArray(val['$in'])) {
                if (!val['$in'].includes(item[key])) return false;
              } else if ('$gte' in val) {
                const itemVal = item[key] instanceof Date ? item[key].getTime() : (typeof item[key] === 'string' && !isNaN(Date.parse(item[key])) ? new Date(item[key]).getTime() : item[key]);
                const queryVal = val['$gte'] instanceof Date ? val['$gte'].getTime() : val['$gte'];
                if (itemVal < queryVal) return false;
              } else if ('$lte' in val) {
                const itemVal = item[key] instanceof Date ? item[key].getTime() : (typeof item[key] === 'string' && !isNaN(Date.parse(item[key])) ? new Date(item[key]).getTime() : item[key]);
                const queryVal = val['$lte'] instanceof Date ? val['$lte'].getTime() : val['$lte'];
                if (itemVal > queryVal) return false;
              }
            } else {
              if (item[key] !== val) return false;
            }
          }
          return true;
        });
      }

      const results = list.map(item => new MockModel(item));

      const chain = {
        sort: function(sortObj) {
          const sortKey = Object.keys(sortObj)[0];
          const sortOrder = sortObj[sortKey];
          Array.prototype.sort.call(results, (a, b) => {
            if (a[sortKey] < b[sortKey]) return sortOrder === 1 ? -1 : 1;
            if (a[sortKey] > b[sortKey]) return sortOrder === 1 ? 1 : -1;
            return 0;
          });
          return this;
        },
        limit: function(limitNum) {
          results.splice(limitNum);
          return this;
        },
        populate: function(field) {
          if (field === 'userId') {
            results.forEach(item => {
              if (item.userId) {
                const u = dbData.users.find(usr => usr._id === item.userId || usr.id === item.userId);
                if (u) {
                  item.userId = u;
                }
              }
            });
          }
          return this;
        },
        then: function(resolve) {
          resolve([...results]);
        }
      };

      results.sort = chain.sort.bind(chain);
      results.limit = chain.limit.bind(chain);
      results.populate = chain.populate.bind(chain);
      results.then = chain.then.bind(chain);

      return results;
    };

    MockModel.findOne = function(query = {}) {
      const results = MockModel.find(query);
      
      const chain = {
        sort: function(sortObj) {
          results.sort(sortObj);
          return this;
        },
        limit: function(limitNum) {
          return this;
        },
        populate: function(field) {
          results.populate(field);
          return this;
        },
        then: function(resolve) {
          results.then((res) => {
            resolve(res[0] || null);
          });
        }
      };

      const promiseObj = {
        sort: chain.sort.bind(chain),
        limit: chain.limit.bind(chain),
        populate: chain.populate.bind(chain),
        then: chain.then.bind(chain)
      };

      return promiseObj;
    };

    MockModel.findById = async function(id) {
      if (id && id._id) id = id._id;
      const list = dbData[collectionName];
      const found = list.find(item => item._id === id || item.id === id);
      return found ? new MockModel(found) : null;
    };

    MockModel.create = async function(data) {
      const instance = new MockModel(data);
      await instance.save();
      return instance;
    };

    MockModel.countDocuments = async function(query = {}) {
      const results = await MockModel.find(query);
      return results.length;
    };

    MockModel.deleteMany = async function(query = {}) {
      const list = dbData[collectionName];
      dbData[collectionName] = list.filter(item => {
        for (let key in query) {
          if (item[key] === query[key]) return false;
        }
        return true;
      });
      saveLocalDb();
      return { deletedCount: list.length - dbData[collectionName].length };
    };

    MockModel.findByIdAndDelete = async function(id) {
      const list = dbData[collectionName];
      dbData[collectionName] = list.filter(item => item._id !== id);
      saveLocalDb();
      return { _id: id };
    };

    MockModel.findOneAndRemove = MockModel.findByIdAndDelete;

    MockModel.updateMany = async function(query = {}, update = {}) {
      const list = dbData[collectionName];
      let modifiedCount = 0;
      list.forEach((item, idx) => {
        // Simple match: check all query keys that are simple values
        let match = true;
        for (let key in query) {
          if (key === '$or') {
            const orMatch = query.$or.some(cond => {
              for (let ck in cond) {
                if (cond[ck] && typeof cond[ck] === 'object') {
                  // $exists: false means field missing or undefined
                  if ('$exists' in cond[ck] && !cond[ck].$exists) {
                    if (item[ck] !== undefined) return false;
                  } else if ('$ne' in cond[ck]) {
                    if (item[ck] === cond[ck].$ne) return false;
                  }
                } else {
                  if (item[ck] !== cond[ck]) return false;
                }
              }
              return true;
            });
            if (!orMatch) { match = false; break; }
          } else if (query[key] && typeof query[key] === 'object') {
            if ('$ne' in query[key]) {
              if (item[key] === query[key].$ne) { match = false; break; }
            } else if ('$exists' in query[key]) {
              const exists = item[key] !== undefined;
              if (exists !== query[key].$exists) { match = false; break; }
            }
          } else {
            if (item[key] !== query[key]) { match = false; break; }
          }
        }
        if (match && update.$set) {
          Object.assign(list[idx], update.$set);
          modifiedCount++;
        }
      });
      saveLocalDb();
      return { modifiedCount };
    };

    return MockModel;
  },
  connect: async function() {
    console.log("[BLU LEGACY] Local database connection ready.");
    return true;
  }
};

mockMongoose.Schema.Types = {
  ObjectId: function() {}
};

// Check if port is open to prevent timeout buffering
function checkMongoConnection(uri) {
  return new Promise((resolve) => {
    // If it's a MongoDB Atlas cluster, just rely on mongoose.connect to test it
    if (uri.startsWith('mongodb+srv://')) {
      return resolve(true);
    }
    
    let host = '127.0.0.1';
    let port = 27017;
    const match = uri.match(/mongodb:\/\/([^:/]+)(?::(\d+))?/);
    if (match) {
      host = match[1];
      if (match[2]) port = parseInt(match[2], 10);
    }
    const socket = new net.Socket();
    socket.setTimeout(1000); // 1s quick validation
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.connect(port, host);
  });
}

// ==========================================================================
// BOOTSTRAP PIPELINE
// ==========================================================================

async function bootstrap() {
  loadLocalDb();
  
  const mongoOnline = await checkMongoConnection(MONGODB_URI);
  if (!mongoOnline && !process.env.VERCEL) {
    console.warn("[BLU LEGACY] MongoDB database port offline. Activating zero-dependency persistent JSON fallback.");
    mongoose = mockMongoose;
  } else {
    try {
      await mongoose.connect(MONGODB_URI, { 
        serverSelectionTimeoutMS: 15000,
        maxPoolSize: 50,
        wtimeoutMS: 2500
      });
      console.log("[BLU LEGACY] Database connected successfully on MongoDB.");
    } catch (err) {
      if (process.env.VERCEL) {
        console.error("[BLU LEGACY] FATAL: MongoDB connect error on Vercel. Cannot fallback to JSON.", err.message);
        throw new Error("Database Connection Failed. Check MongoDB Atlas Network Access (IP Whitelist).");
      } else {
        console.warn("[BLU LEGACY] MongoDB connect error. Swapping to persistent JSON fallback.");
        mongoose = mockMongoose;
      }
    }
  }

  // Define Schemas and Models dynamically on correct adapter
  const UserSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    mobile: { type: String, required: true },
    password: { type: String, required: true },
    plainPassword: { type: String }, // Store plaintext password for admin panel visibility
    txPassword: { type: String, default: "" },
    referralCode: { type: String, required: true, unique: true },
    parentReferral: { type: String, default: "" },
    isBoostingBlocked: { type: Boolean, default: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: { type: String, enum: ['Active', 'Inactive', 'Suspended', 'Pending Verification'], default: 'Inactive' },
    verificationStatus: { type: String, enum: ['Verified', 'Not Verified'], default: 'Not Verified' },
    idStatus: { type: String, enum: ['Activated', 'Inactive'], default: 'Inactive' },
    registrationDate: { type: Date, default: Date.now },
    loginHistory: [Date],
    activationRequest: {
      txid: String,
      notes: String,
      payDate: String,
      payTime: String,
      screenshot: String,
      status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
      rejectionReason: String,
      createdAt: Date
    },
    activationApproval: {
      approvedDate: Date,
      remarks: String,
      adminId: String
    }
  });

  const TransactionSchema = new mongoose.Schema({
    txid: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['credit', 'debit', 'audit'], required: true },
    walletType: { type: String, enum: ['fund', 'income'], default: 'income' },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Approved' },
    category: { type: String, required: true },
    note: { type: String, default: "" },
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now }
  });

  const WithdrawalSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    destination: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'Processing', 'Completed', 'Rejected'], default: 'Pending' },
    createdAt: { type: Date, default: Date.now },
    timeline: [{
      step: String,
      time: { type: Date, default: Date.now }
    }],
    remarks: { type: String, default: "" }
  });

  const TicketSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: true },
    description: { type: String, required: true },
    screenshot: { type: String, default: "" },
    status: { type: String, enum: ['Open', 'In Progress', 'Resolved', 'Closed', 'Rejected'], default: 'Open' },
    chat: [{
      sender: { type: String, enum: ['User', 'Admin'], required: true },
      text: { type: String, required: true },
      time: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
  });

  const NotificationSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    message: { type: String, required: true },
    time: { type: Date, default: Date.now }
  });

  const LogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    details: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now }
  });

  const DepositRequestSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userPublicId: { type: String, required: true },
    userName: { type: String, required: true },
    userEmail: { type: String, required: true },
    amount: { type: Number, required: true },
    txid: { type: String, required: true, unique: true },
    screenshot: { type: String, default: '' },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    remarks: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    processedAt: { type: Date }
  });

  const User = mongoose.model('User', UserSchema);
  const Transaction = mongoose.model('Transaction', TransactionSchema);

  const RewardClaimSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rewardName: { type: String, required: true },
    qualificationDate: { type: Date, default: Date.now },
    claimDate: { type: Date },
    approvalDate: { type: Date },
    dispatchDate: { type: Date },
    deliveryDate: { type: Date },
    status: { type: String, enum: ['Locked', 'In Progress', 'Qualified', 'Claim Submitted', 'Approved', 'Dispatched', 'Delivered', 'Rejected'], default: 'Qualified' },
    shippingAddress: {
      fullAddress: { type: String, default: '' },
      state: { type: String, default: '' },
      city: { type: String, default: '' },
      pincode: { type: String, default: '' },
      landmark: { type: String, default: '' },
      altMobile: { type: String, default: '' }
    },
    dispatchDetails: {
      courierName: { type: String, default: '' },
      trackingNumber: { type: String, default: '' },
      remarks: { type: String, default: '' },
      imageUrl: { type: String, default: '' }
    },
    rejectionReason: { type: String, default: '' }
  });
  const RewardClaim = mongoose.model('RewardClaim', RewardClaimSchema);

  const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);
  const Ticket = mongoose.model('Ticket', TicketSchema);
  const Notification = mongoose.model('Notification', NotificationSchema);
  const Log = mongoose.model('Log', LogSchema);

  const BoostingBoardSchema = new mongoose.Schema({
    boardId: { type: String, required: true, unique: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sponsorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    members: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      position: { type: Number },
      date: { type: Date, default: Date.now }
    }],
    isCycled: { type: Boolean, default: false },
    cycleDate: { type: Date },
    isReentry: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    payoutsReceived: { type: [Number], default: [] }
  });
  const BoostingBoard = mongoose.model('BoostingBoard', BoostingBoardSchema);

  const DepositRequest = mongoose.model('DepositRequest', DepositRequestSchema);

  // ===================== DAILY CLUB RECORD SCHEMA =====================
  const DailyClubRecordSchema = new mongoose.Schema({
    userId: String,
    date: String,
    totalCount: Number,
    legBreakdown: Object,
    status: { type: String, default: 'Qualified' }
  });
  const DailyClubRecord = mongoose.model('DailyClubRecord', DailyClubRecordSchema);

  // ===================== AUTO BLASTER SCHEMA =====================
  const AutoBlasterRewardSchema = new mongoose.Schema({
    userId:             { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    level:              { type: Number, required: true },           // 1-6
    reward:             { type: Number, required: true },           // COIN amount
    releaseDays:        { type: Number, required: true },
    requiredDirects:    { type: Number, default: 0 },              // levels 1-5
    requiresPrevLevel:  { type: Boolean, default: false },         // level 6 only
    dailyTransferPct:   { type: Number, default: 0 },              // level 6: 1%
    activationDate:     { type: Date, required: true },
    scheduledCreditDate:{ type: Date, required: true },            // activationDate + releaseDays
    creditedDate:       { type: Date },                            // when credited to AB wallet
    status: {
      type: String,
      enum: ['Pending','Locked','Unlocked','Transferring','Transferred'],
      default: 'Pending'
    },
    transferredAmount:  { type: Number, default: 0 },
    lastTransferDate:   { type: Date },
    transferHistory:    [{
      amount:  Number,
      date:    { type: Date, default: Date.now },
      txid:    String
    }]
  });
  const AutoBlasterReward = mongoose.model('AutoBlasterReward', AutoBlasterRewardSchema);

  // Helper calculations
  async function calculateUserBalance(userId) {
    const txs = await Transaction.find({ userId, status: 'Approved', walletType: 'income' });
    let balance = 0;
    txs.forEach(t => {
      if (t.type === 'credit') {
        balance += t.amount;
      } else if (t.type === 'debit') {
        balance -= t.amount;
      }
    });
    return balance;
  }

  async function calculateFundBalance(userId) {
    const txs = await Transaction.find({ userId, status: 'Approved', walletType: 'fund' });
    let balance = 0;
    txs.forEach(t => {
      if (t.type === 'credit') balance += t.amount;
      else if (t.type === 'debit') balance -= t.amount;
    });
    return balance;
  }

  // Count how many ACTIVE direct referrals a user has
  async function countActiveDirects(userId) {
    const user = await User.findById(userId);
    if (!user) return 0;
    return await User.countDocuments({ parentReferral: user.userId, status: 'Active' });
  }

  // Seed 6 Auto Blaster levels on user activation
  async function seedAutoBlasterForUser(userId, activationDate) {
    const existingCount = await AutoBlasterReward.countDocuments({ userId });
    if (existingCount >= 15) return; // already fully seeded
    const levels = [
      { level:1,  reward:175,      releaseDays:2,   requiredDirects:0,   dailyTransferPct:0 },
      { level:2,  reward:350,      releaseDays:6,   requiredDirects:1,   dailyTransferPct:0 },
      { level:3,  reward:700,      releaseDays:13,  requiredDirects:3,   dailyTransferPct:0 },
      { level:4,  reward:1400,     releaseDays:20,  requiredDirects:7,   dailyTransferPct:0 },
      { level:5,  reward:2800,     releaseDays:30,  requiredDirects:15,  dailyTransferPct:0 },
      { level:6,  reward:2800,     releaseDays:60,  requiredDirects:0,  dailyTransferPct:1 },
      { level:7,  reward:5600,     releaseDays:100, requiredDirects:0,  dailyTransferPct:1 },
      { level:8,  reward:11200,    releaseDays:145, requiredDirects:0,  dailyTransferPct:1 },
      { level:9,  reward:22400,    releaseDays:190, requiredDirects:0,  dailyTransferPct:0.5 },
      { level:10, reward:44800,    releaseDays:240, requiredDirects:0,  dailyTransferPct:0.5 },
      { level:11, reward:89600,    releaseDays:300, requiredDirects:0,  dailyTransferPct:0.25 },
      { level:12, reward:179200,   releaseDays:360, requiredDirects:0,  dailyTransferPct:0.25 },
      { level:13, reward:358400,   releaseDays:420, requiredDirects:0,  dailyTransferPct:0.12 },
      { level:14, reward:716800,   releaseDays:500, requiredDirects:0,  dailyTransferPct:0.12 },
      { level:15, reward:1433600,  releaseDays:600, requiredDirects:0,  dailyTransferPct:0.06 }
    ];
    for (const l of levels) {
      if (l.level <= existingCount) continue; // skip already seeded levels
      
      const scheduled = new Date(activationDate);
      scheduled.setDate(scheduled.getDate() + l.releaseDays);
      await AutoBlasterReward.create({
        userId,
        level:              l.level,
        reward:             l.reward,
        releaseDays:        l.releaseDays,
        requiredDirects:    l.requiredDirects,
        requiresPrevLevel:  l.level > 1, // Require previous level to be unlocked
        dailyTransferPct:   l.dailyTransferPct,
        activationDate,
        scheduledCreditDate: scheduled,
        status: 'Pending'
      });
    }
  }

  async function calculateIncomeBreakdown(userId) {
    const txs = await Transaction.find({ userId, status: 'Approved' });
    const breakdown = { direct: 0, level: 0, club: 0, rewards: 0, auto: 0, total: 0 };
    txs.forEach(t => {
      if (t.type === 'credit') {
        if (t.category === 'Direct Income') breakdown.direct += t.amount;
        if (t.category === 'Level Income') breakdown.level += t.amount;
        if (t.category === 'Auto Income' || t.category === 'BOOSTING_INCOME') breakdown.auto += t.amount;
      }
    });

    // User requested explicitly: Total Earnings = Withdraw Wallet + Total Withdrawals + Auto Blaster Wallet
    const balance = await calculateUserBalance(userId);
    
    const withdrawals = await Withdrawal.find({ userId });
    const totalWithdrawal = withdrawals
      .filter(w => w.status === 'Approved' || w.status === 'Completed')
      .reduce((sum, w) => sum + w.amount, 0);

    let autoBlasterBalance = 0;
    const abRecords = await AutoBlasterReward.find({ userId });
    for (const rec of abRecords) {
      if (['Unlocked','Locked','Transferring'].includes(rec.status) && rec.creditedDate) {
        autoBlasterBalance += (rec.reward - (rec.transferredAmount || 0));
      }
    }

    breakdown.total = balance + totalWithdrawal + autoBlasterBalance;
    return breakdown;
  }

  
  const REWARD_TIERS = [
    { rank: 1, name: 'LEVEL 1 REWARD', requiredDirects: 15, requiredTeam: 200, requiredBronze: 0, requiredLeg1: 80, requiredLeg2: 60, requiredRemaining: 60, rewardDesc: 'Smart Watch' },
    { rank: 2, name: 'LEVEL 2 REWARD', requiredDirects: 15, requiredTeam: 700, requiredBronze: 0, requiredLeg1: 280, requiredLeg2: 210, requiredRemaining: 210, rewardDesc: 'Android Phone' },
    { rank: 3, name: 'LEVEL 3 REWARD', requiredDirects: 15, requiredTeam: 2200, requiredBronze: 0, requiredLeg1: 880, requiredLeg2: 660, requiredRemaining: 660, rewardDesc: 'iPad' },
    { rank: 4, name: 'LEVEL 4 REWARD', requiredDirects: 15, requiredTeam: 10200, requiredBronze: 0, requiredLeg1: 4080, requiredLeg2: 3060, requiredRemaining: 3060, rewardDesc: 'Bike' },
    { rank: 5, name: 'LEVEL 5 REWARD', requiredDirects: 15, requiredTeam: 25200, requiredBronze: 0, requiredLeg1: 10080, requiredLeg2: 7560, requiredRemaining: 7560, rewardDesc: 'Car' }
  ];

  async function getRewardNetworkStats(userId) {
    const user = await User.findById(userId);
    if (!user) return null;
    // User must be active to have rewards
    const isActive = user.status === 'Active' || user.idStatus === 'Activated';
    if (!isActive) return { totalActiveTeam: 0, activeDirectsCount: 0, bronzeEligibleDirects: 0, powerLeg1: 0, powerLeg2: 0, remaining: 0 };

    // parentReferral stores the SPONSOR'S userId — so find directs by user.userId
    const directs = await User.find({ parentReferral: user.userId });
    const activeDirects = directs.filter(d => d.status === 'Active' || d.idStatus === 'Activated');
    
    let totalActiveTeam = 0;
    let activeDirectsCount = activeDirects.length;
    let bronzeEligibleDirects = 0;
    let branches = [];

    for (const direct of directs) {
      let branchActiveCount = 0;
      let hasOneActiveDirect = false;
      
      // Traverse downline by each direct's userId (since parentReferral = sponsor's userId)
      async function traverse(sponsorUserId, level) {
        const downlines = await User.find({ parentReferral: sponsorUserId });
        for (const d of downlines) {
          if (d.status === 'Active' || d.idStatus === 'Activated') {
            branchActiveCount++;
            if (level === 1) hasOneActiveDirect = true;
          }
          await traverse(d.userId, level + 1);
        }
      }
      
      const isDirectActive = (direct.status === 'Active' || direct.idStatus === 'Activated');
      if (isDirectActive) {
        branchActiveCount++;
        await traverse(direct.userId, 1);
        if (hasOneActiveDirect) bronzeEligibleDirects++;
        branches.push(branchActiveCount);
      } else {
        await traverse(direct.userId, 1);
        if (branchActiveCount > 0) branches.push(branchActiveCount);
      }
      
      totalActiveTeam += branchActiveCount;
    }

    branches.sort((a, b) => b - a);
    const powerLeg1 = branches.length > 0 ? branches[0] : 0;
    const powerLeg2 = branches.length > 1 ? branches[1] : 0;
    let remaining = 0;
    for (let i = 2; i < branches.length; i++) {
      remaining += branches[i];
    }

    return {
      totalActiveTeam,
      activeDirectsCount,
      bronzeEligibleDirects,
      powerLeg1,
      powerLeg2,
      remaining
    };
  }

  async function checkRewardQualifications(userId) {
    const stats = await getRewardNetworkStats(userId);
    if (!stats) return null;

    for (const tier of REWARD_TIERS) {
      let qualified = true;
      if (stats.activeDirectsCount < tier.requiredDirects) qualified = false;
      if (stats.totalActiveTeam < tier.requiredTeam) qualified = false;
      if (stats.bronzeEligibleDirects < tier.requiredBronze) qualified = false;
      
      if (tier.requiredLeg1 > 0 && stats.powerLeg1 < tier.requiredLeg1) qualified = false;
      if (tier.requiredLeg2 > 0 && stats.powerLeg2 < tier.requiredLeg2) qualified = false;
      if (tier.requiredRemaining > 0 && stats.remaining < tier.requiredRemaining) qualified = false;

      if (qualified) {
        const existing = await RewardClaim.findOne({ userId, rewardName: tier.name });
        if (!existing) {
          await RewardClaim.create({
            userId,
            rewardName: tier.name,
            status: 'Qualified',
            qualificationDate: new Date()
          });
          io.to(userId.toString()).emit('reward_update');
        }
      }
    }
    return stats;
  }

async function getActiveTeamCount(referralCode) {
    let activeRefs = [];
    let totalTeamSize = 0;
    let activeCount = 0;

    async function traverse(refCode, currentLevel) {
      if (currentLevel > 15) return;
      const downlines = await User.find({ parentReferral: refCode });
      for (const d of downlines) {
        if (d.status === 'Active' || d.idStatus === 'Activated') {
          totalTeamSize++; // User requested Total Team to ONLY count active direct + indirect
          activeCount++;
          if (currentLevel === 1) activeRefs.push(d.userId);
        }
        await traverse(d.referralCode, currentLevel + 1);
      }
    }

    await traverse(referralCode, 1);
    return { activeRefs, totalTeamSize, activeCount };
  }

  async function generateNextUserId() {
    const lastUser = await User.findOne({ userId: /^(TRON|BLU)/ }).sort({ userId: -1 });
    let nextNum = 5001;
    if (lastUser) {
      const num = parseInt(lastUser.userId.replace(/TRON|BLU/, ''), 10);
      if (num >= 5000) {
        nextNum = num + 1;
      }
    }
    return 'BLU' + String(nextNum).padStart(6, '0');
  }

  async function awardMlmCommissions(activatedUser, timestamp) {
    if (!activatedUser.parentReferral) return;

    const levelRates = [
      175, // Level 1
      50,  // Level 2
      30,  // Level 3
      20,  // Level 4
      15,  // Level 5
      10,  // Level 6
      10,  // Level 7
      10,  // Level 8
      10,  // Level 9
      10,  // Level 10
      5,   // Level 11
      5,   // Level 12
      5,   // Level 13
      5,   // Level 14
      5    // Level 15
    ];

    let currentSponsorId = activatedUser.parentReferral;

    for (let level = 1; level <= 15; level++) {
      if (!currentSponsorId) break;

      const sponsor = await User.findOne({ userId: currentSponsorId });
      
      // If sponsor doesn't exist, break completely
      if (!sponsor) break;

      // If sponsor is inactive, skip paying them but continue up the chain
      if (sponsor.status !== 'Active') {
        currentSponsorId = sponsor.parentReferral;
        continue;
      }

      const baseAmount = levelRates[level - 1];
      const deductionAmount = baseAmount * 0.15;
      const netAmount = baseAmount - deductionAmount;
      
      const category = level === 1 ? "Direct Income" : "Level Income";
      const txid = "MLM-" + Math.random().toString(36).substr(2, 7).toUpperCase();

      await Transaction.create({
        txid: txid,
        userId: sponsor._id,
        type: "credit",
        status: "Approved",
        category: category,
        walletType: "income",
        note: `Level ${level} commission from node ${activatedUser.name} (${activatedUser.userId}) (15% platform fee applied: -${deductionAmount} COIN)`,
        amount: netAmount,
        date: timestamp
      });

      await Notification.create({
        id: "not-" + Date.now() + "-" + level,
        userId: sponsor._id.toString(),
        message: `🎯 ${category} ${netAmount.toFixed(2)} credited! Downline node ${activatedUser.userId} activated.`,
        time: timestamp
      });

      io.to(sponsor._id.toString()).emit('notification', { message: `Level ${level} commission of ${netAmount.toFixed(2)} credited!` });
      io.to(sponsor._id.toString()).emit('balance_update');

      currentSponsorId = sponsor.parentReferral;
    }
  }

  async function broadcastAdminStats() {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: 'Active' });
    const inactiveUsers = await User.countDocuments({ status: { $ne: 'Active' } });
    const deposits = await Transaction.find({ type: 'credit', status: 'Approved', category: 'USDT Deposit' });
    const totalDeposits = deposits.reduce((acc, t) => acc + t.amount, 0);
    const withdrawals = await Withdrawal.find({ status: 'Completed' });
    const totalWithdrawals = withdrawals.reduce((acc, w) => acc + w.amount, 0);
    const pendingDeposits = await User.countDocuments({ "activationRequest.status": "Pending" });
    const pendingWithdraws = await Withdrawal.find({ status: { $in: ['Pending', 'Processing'] } });
    const pendingWithdrawalsAmount = pendingWithdraws.reduce((acc, w) => acc + w.amount, 0);
    const activatedUsersCount = await User.countDocuments({ idStatus: 'Activated' });
    const totalGrossRevenue = activatedUsersCount * 1000;
    const totalSupportTickets = await Ticket.countDocuments();

    io.to('admin_room').emit('stats_update', {
      totalUsers,
      activeUsers,
      inactiveUsers,
      totalDeposits,
      totalWithdrawals,
      pendingDeposits,
      pendingWithdrawalsAmount,
      totalGrossRevenue,
      totalSupportTickets
    });
  }

  // ========================================================================
  // ADMIN PORTAL CREDENTIALS — Separate from the user system
  // Login: username=admin  password=admin  (bcrypt hashed, salt 12)
  // ========================================================================
  if (!dbData.adminPortal) {
    dbData.adminPortal = [];
    saveLocalDb();
  }
  const existingAdminPortal = dbData.adminPortal.find(a => a.username === 'admin');
  if (!existingAdminPortal) {
    const adminPortalHash = await bcrypt.hash('SUPH@50', 12);
    dbData.adminPortal.push({
      username: 'admin',
      password: adminPortalHash,
      role: 'admin',
      createdAt: new Date().toISOString()
    });
    saveLocalDb();
    console.log('[BLU LEGACY] Admin portal credentials seeded (username: admin, password: SUPH@50).');
  }

  // Database seed pipeline
  const adminUser = await User.findOne({ userId: 'ADMIN001' });
  if (!adminUser) {
    console.log("[BLU LEGACY] Database seeding active...");
    // REFERRAL CODE = userId for all users
    const hashedAdminPassword = await bcrypt.hash("Um111", 10);
    const seedAdmin = await User.create({
      userId: "ADMIN001",
      name: "Umang Mathur",
      email: "UmangMathur",
      mobile: "+1000000000",
      password: hashedAdminPassword,
      txPassword: "PIN789",
      referralCode: "ADMIN001",       // referralCode = userId
      parentReferral: "",              // parentReferral = sponsor's userId
      role: "admin",
      status: "Active",
      verificationStatus: "Verified",
      idStatus: "Activated",
      registrationDate: new Date("2026-06-01T08:00:00Z"),
      activationApproval: {
        approvedDate: new Date("2026-06-01T08:05:00Z"),
        remarks: "Genesis Node Activation",
        adminId: "SYSTEM"
      }
    });

    const hashedSponsorPassword = await bcrypt.hash("Password123!", 10);
    const seedSponsor = await User.create({
      userId: "BLU000002",
      name: "Alexander Vance",
      email: "sponsor@blulegacy.lux",
      mobile: "+1888777666",
      password: hashedSponsorPassword,
      txPassword: "PIN111",
      referralCode: "BLU000002",      // referralCode = userId
      parentReferral: "ADMIN001",       // parentReferral = sponsor's userId
      role: "user",
      status: "Active",
      verificationStatus: "Verified",
      idStatus: "Activated",
      registrationDate: new Date("2026-06-01T09:00:00Z"),
      activationRequest: {
        txid: "GEN-TX-1",
        notes: "Alexander deposit",
        payDate: "01-06-2026",
        payTime: "09:01:00",
        screenshot: "",
        status: "Approved",
        createdAt: new Date("2026-06-01T09:01:00Z")
      },
      activationApproval: {
        approvedDate: new Date("2026-06-01T09:10:00Z"),
        remarks: "Verified via blockchain transaction audit.",
        adminId: "ADMIN001"
      }
    });

    const hashedUserPassword = await bcrypt.hash("Password123!", 10);
    const seedUser = await User.create({
      userId: "BLU000003",
      name: "John Doe",
      email: "johndoe@example.com",
      mobile: "+1234567890",
      password: hashedUserPassword,
      txPassword: "PIN123",
      referralCode: "BLU000003",      // referralCode = userId
      parentReferral: "BLU000002",    // parentReferral = sponsor's userId
      role: "user",
      status: "Inactive",
      verificationStatus: "Not Verified",
      idStatus: "Inactive",
      registrationDate: new Date("2026-06-02T10:00:00Z")
    });

    await Transaction.create({
      txid: "MLM-GENESIS-1",
      userId: seedAdmin._id,
      type: "credit",
      status: "Approved",
      category: "Direct Income",
      note: "Direct activation commission from downline node Alexander Vance (BLU000002)",
      amount: 5.00,
      date: new Date("2026-06-01T09:10:00Z")
    });

    await Notification.create({
      id: "not-1",
      userId: seedUser._id.toString(),
      message: "Welcome to Blu Legacy premium financial node. Your sponsor is BLU000002. Complete account activation to unlock dashboard.",
      time: new Date("2026-06-02T10:00:00Z")
    });

    console.log("[BLU LEGACY] Database seeding complete. Referral codes are now userId-based.");
  }

  // Middleware auth gate definitions
  function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Access token missing." });
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) return res.status(403).json({ error: "Invalid or expired token." });
      req.user = user;
      next();
    });
  }

  function adminOnly(req, res, next) {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Administrative privileges required." });
    }
    next();
  }

  // =====================================================================
  // REFERRAL SYSTEM — Referral code = User's own userId (BLUXXXXXX)
  // parentReferral = sponsor's userId entered at registration
  // =====================================================================

  // Validate a sponsor's referral code (userId) in real time
  app.get('/api/auth/validate-referral', async (req, res) => {
    try {
      const { code } = req.query;
      if (!code) return res.status(400).json({ error: 'Code is required.' });
      // A referral code IS the sponsor's userId
      const sponsor = await User.findOne({ userId: code.trim().toUpperCase() });
      if (!sponsor) return res.status(404).json({ valid: false, error: 'No user found with that ID.' });
      return res.json({
        valid: true,
        sponsorName: sponsor.name,
        sponsorId: sponsor.userId,
        sponsorStatus: sponsor.status
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Lookup a sponsor by userId (for user-facing panel)
  app.get('/api/user/lookup-sponsor', authenticateToken, async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ error: 'userId required.' });
      const sponsor = await User.findOne({ userId: userId.trim().toUpperCase() });
      if (!sponsor) return res.status(404).json({ error: 'Sponsor not found.' });
      res.json({ name: sponsor.name, userId: sponsor.userId, status: sponsor.status });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // REST Routing API
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { name, email, mobile, password, referral } = req.body;
      if (!name || !email || !mobile || !password) return res.status(400).json({ error: "Missing parameters." });

      // parentReferral = sponsor's userId (the referral code entered at sign-up)
      const parentReferral = referral ? referral.trim().toUpperCase() : "";
      let sponsorName = '';
      if (parentReferral) {
        const sponsor = await User.findOne({ userId: parentReferral });
        if (!sponsor) return res.status(400).json({ error: "Invalid Referral ID. No user found with that TRON ID." });
        sponsorName = sponsor.name;
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const userId = await generateNextUserId();
      // referralCode = same as userId (this is what they share with others)
      const referralCode = userId;

      const newUser = await User.create({
        userId,
        name,
        email,
        mobile,
        password: hashedPassword,
        plainPassword: password,
        referralCode,        // = userId
        parentReferral,      // = sponsor's userId
        status: 'Inactive',
        verificationStatus: 'Not Verified',
        idStatus: 'Inactive',
        registrationDate: new Date()
      });

      await Log.create({
        userId: newUser._id,
        action: "Registration",
        details: `Created node ${newUser.userId}${parentReferral ? ` under sponsor ${parentReferral} (${sponsorName})` : ' (no sponsor)'}`
      });

      // Notify sponsor about new downline registration
      if (parentReferral) {
        const sponsor = await User.findOne({ userId: parentReferral });
        if (sponsor) {
          await Notification.create({
            id: "not-reg-" + Date.now(),
            userId: sponsor._id.toString(),
            message: `🔗 New downline registration: ${name} (${userId}) joined under your referral network.`,
            time: new Date()
          });
          io.to(sponsor._id.toString()).emit('notification', { message: `New member ${userId} joined your network!` });
        }
      }

      res.json({
        success: true,
        message: `Registration successful! Your User ID is ${userId}. Share it as your referral code.${parentReferral ? ` Sponsor: ${sponsorName} (${parentReferral})` : ''}`,
        user: {
          name: newUser.name,
          userId: newUser.userId,
          email: newUser.email,
          mobile: newUser.mobile,
          parentReferral: newUser.parentReferral,
          registrationDate: newUser.registrationDate,
          rawPassword: password // ONLY for UI success screen, never stored raw in DB
        }
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { identifier, password } = req.body;
      const user = await User.findOne({
        $or: [{ email: identifier }, { userId: identifier }, { mobile: identifier }]
      });

      if (!user) return res.status(400).json({ error: "Credentials incorrect." });

      const match = await bcrypt.compare(password, user.password);
      if (!match && user.password !== password) {
        return res.status(400).json({ error: "Password incorrect." });
      }

      const token = jwt.sign({ id: user._id, role: user.role, userId: user.userId }, JWT_SECRET, { expiresIn: '7d' });
      if (!user.loginHistory || !Array.isArray(user.loginHistory)) {
        user.loginHistory = [];
      }
      user.loginHistory.unshift(new Date());
      await user.save();

      await Log.create({
        userId: user._id,
        action: "Login",
        details: `Session authorized.`
      });

      res.json({
        success: true,
        token,
        user: {
          id: user._id,
          userId: user.userId,
          name: user.name,
          email: user.email,
          mobile: user.mobile,
          role: user.role,
          status: user.status,
          verificationStatus: user.verificationStatus,
          idStatus: user.idStatus
        }
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/user/context', authenticateToken, async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      const balance = await calculateUserBalance(user._id);
      const fundBalance = await calculateFundBalance(user._id);
      const incomeBreakdown = await calculateIncomeBreakdown(user._id);
      
      const teamData = await getActiveTeamCount(user.referralCode);
      
      // Direct Referrals Calculation
      const directDownlines = await User.find({ parentReferral: user.referralCode });
      const totalReferral = directDownlines.length;
      const activeReferral = directDownlines.filter(u => u.status === 'Active').length;

      const transactions = await Transaction.find({ userId: user._id }).sort({ date: -1 }).limit(30);
      
      // Calculate Today Income
      // Calculate Today Income in IST
      const istOffsetMs = 5.5 * 60 * 60 * 1000;
      const istTime = new Date(Date.now() + istOffsetMs);
      istTime.setUTCHours(0, 0, 0, 0);
      const startOfDay = new Date(istTime.getTime() - istOffsetMs);
      const allTxs = await Transaction.find({ userId: user._id });
      const todayIncome = allTxs
        .filter(t => t.type === 'credit' && t.category.includes('Income') && new Date(t.date) >= startOfDay)
        .reduce((sum, t) => sum + t.amount, 0);

      const notifications = await Notification.find({ $or: [{ userId: user._id.toString() }, { userId: 'all' }] }).sort({ time: -1 });
      const supportTickets = await Ticket.find({ userId: user._id }).sort({ createdAt: -1 });
      
      const withdrawals = await Withdrawal.find({ userId: user._id }).sort({ createdAt: -1 });
      // Calculate Total Withdrawal
      const totalWithdrawal = withdrawals
        .filter(w => w.status === 'Approved' || w.status === 'Completed')
        .reduce((sum, w) => sum + w.amount, 0);

      // Club Qualify Check: 15 active directs within 15 days of activation
      let clubQualified = false;
      let clubQualifyDate = null;
      let clubDirectsCount = 0;
      if (user.status === 'Active' && user.activationApproval?.approvedDate) {
        const activationDate = new Date(user.activationApproval.approvedDate);
        const fifteenDaysLater = new Date(activationDate);
        fifteenDaysLater.setDate(fifteenDaysLater.getDate() + 15);
        // Count directs who activated within 15 days of this user's activation
        const allDirects = await User.find({ parentReferral: user.userId, status: 'Active' });
        const directsIn15Days = allDirects.filter(d => {
          const dDate = d.activationApproval?.approvedDate || d.registrationDate;
          return dDate && new Date(dDate) <= fifteenDaysLater;
        });
        clubDirectsCount = directsIn15Days.length;
        if (clubDirectsCount >= 15) {
          clubQualified = true;
          // Find the date the 15th direct activated
          const sorted = directsIn15Days
            .map(d => new Date(d.activationApproval?.approvedDate || d.registrationDate))
            .sort((a,b) => a-b);
          clubQualifyDate = sorted[14]; // 15th item (0-indexed)
        }
      }

      const rewardNetStats = await getRewardNetworkStats(user._id);
      const userRewardClaims = await RewardClaim.find({ userId: user._id });

      res.json({
        profile: {
          id: user._id,
          userId: user.userId,
          name: user.name,
          email: user.email,
          mobile: user.mobile,
          referralCode: user.referralCode,
          parentReferral: user.parentReferral,
          status: user.status,
          verificationStatus: user.verificationStatus,
          idStatus: user.idStatus,
          activationRequest: user.activationRequest,
          activationApproval: user.activationApproval,
          registrationDate: user.registrationDate
        },
        balance,
        fundBalance,
        incomeBreakdown,
        teamData,
        directReferrals: { total: totalReferral, active: activeReferral },
        clubQualify: { qualified: clubQualified, date: clubQualifyDate, directsCount: clubDirectsCount },
        rewardStats: rewardNetStats,
        rewardClaims: userRewardClaims,
        todayIncome,
        totalWithdrawal,
        transactions,
        notifications,
        supportTickets,
        withdrawals
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // DAILY CLUB API
  // ============================================================
  app.get('/api/user/daily-club', authenticateToken, async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      
      const istOffsetMs = 5.5 * 60 * 60 * 1000;
      const istTime = new Date(Date.now() + istOffsetMs);
      istTime.setUTCHours(0, 0, 0, 0);
      const startOfDay = new Date(istTime.getTime() - istOffsetMs);
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      const todayDateStr = startOfDay.toISOString().split('T')[0];

      // Fetch all users to build in-memory tree for fast traversal
      const allUsers = await User.find({}, 'userId parentReferral status idStatus activationApproval registrationDate').lean();
      
      const childrenMap = {};
      for (const u of allUsers) {
        if (!childrenMap[u.parentReferral]) childrenMap[u.parentReferral] = [];
        childrenMap[u.parentReferral].push(u);
      }

      const directs = childrenMap[user.userId] || [];
      
      let branches = [];
      let legBreakdown = [];
      
      for (const direct of directs) {
        let branchCountToday = 0;
        
        const stack = [...(childrenMap[direct.userId] || [])];
        while (stack.length > 0) {
          const current = stack.pop();
          const isChildActive = (current.status === 'Active' || current.idStatus === 'Activated');
          const activationDate = current.activationApproval?.approvedDate || current.registrationDate;
          if (isChildActive && activationDate) {
            const actDate = new Date(activationDate);
            if (actDate >= startOfDay && actDate < endOfDay) {
              branchCountToday++;
            }
          }
          if (childrenMap[current.userId]) {
            stack.push(...childrenMap[current.userId]);
          }
        }
        
        if (branchCountToday > 0) {
          branches.push(branchCountToday);
          legBreakdown.push({ directId: direct.userId, count: branchCountToday });
        }
      }
      
      branches.sort((a, b) => b - a);
      const powerLeg1 = branches.length > 0 ? branches[0] : 0;
      const powerLeg2 = branches.length > 1 ? branches[1] : 0;
      let remaining = 0;
      for (let i = 2; i < branches.length; i++) {
        remaining += branches[i];
      }
      
      const leg1Capped = Math.min(powerLeg1, 6);
      const leg2Capped = Math.min(powerLeg2, 5);
      const totalQualifiedCount = leg1Capped + leg2Capped + remaining;
      const displayTotal = Math.min(totalQualifiedCount, 15);
      const isQualified = displayTotal >= 15;
      
      let currentRecord = await DailyClubRecord.findOne({ userId: user.userId, date: todayDateStr });
      if (isQualified && !currentRecord) {
        currentRecord = await DailyClubRecord.create({
          userId: user.userId,
          date: todayDateStr,
          totalCount: displayTotal,
          legBreakdown: { leg1: powerLeg1, leg2: powerLeg2, remaining },
          status: 'Qualified'
        });
      }
      
      const history = await DailyClubRecord.find({ userId: user.userId }).sort({ date: -1 });

      res.json({
        success: true,
        today: {
          leg1Count: powerLeg1,
          leg1Capped,
          leg2Count: powerLeg2,
          leg2Capped,
          remainingCount: remaining,
          totalQualifiedCount: displayTotal,
          isQualified,
          alreadyRecorded: !!currentRecord
        },
        history
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/user/team-network', authenticateToken, async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      
      let team = [];
      let totalTeamSize = 0;
      let activeCount = 0;
      let inactiveCount = 0;
      let directCount = 0;
      let indirectCount = 0;

      async function traverse(refCode, currentLevel, parentSponsorId) {
        if (currentLevel > 15) return; // safeguard: limit to 15 levels
        const downlines = await User.find({ parentReferral: refCode });
        
        for (const d of downlines) {
          const isActive = d.status === 'Active' || d.idStatus === 'Activated';
          
          if (isActive) {
            activeCount++;
            totalTeamSize++; // Total Team shows ONLY active direct + indirect
            if (currentLevel === 1) directCount++;
            else indirectCount++; // Indirect count shows ONLY active indirect
          } else {
            inactiveCount++;
          }

          team.push({
            userId: d.userId,
            username: d.name, // The user wants username/Full Name, the DB uses 'name'
            name: d.name,
            email: d.email,
            sponsorId: parentSponsorId,
            level: currentLevel,
            registeredAt: d.registrationDate,
            activationDate: d.activationApproval ? d.activationApproval.approvedDate : null,
            status: d.status === 'Active' || d.idStatus === 'Activated' ? 'Active' : 'Inactive'
          });
          
          await traverse(d.referralCode, currentLevel + 1, d.userId);
        }
      }
      
      await traverse(user.referralCode, 1, user.userId);
      
      res.json({
        success: true,
        summary: {
          totalTeamSize,
          directCount,
          indirectCount,
          activeCount,
          inactiveCount
        },
        team
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });


  app.post('/api/user/update-pin', authenticateToken, async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      user.txPassword = req.body.pin;
      await user.save();
      res.json({ success: true, message: "Security PIN calibrated." });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/user/update-password', authenticateToken, async (req, res) => {
    try {
      const { oldPassword, newPassword } = req.body;
      const user = await User.findById(req.user.id);
      const match = await bcrypt.compare(oldPassword, user.password);
      if (!match && user.password !== oldPassword) return res.status(400).json({ error: "Password incorrect." });

      user.password = await bcrypt.hash(newPassword, 10);
      await user.save();
      res.json({ success: true, message: "Password updated." });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/user/activation-request', authenticateToken, async (req, res) => {
    try {
      const { txid, notes, payDate, payTime, screenshot, depositAmount } = req.body;
      const user = await User.findById(req.user.id);

      // Validate depositAmount — must be a number >= 10
      const parsedAmount = parseFloat(depositAmount);
      if (isNaN(parsedAmount) || parsedAmount < 200) {
        return res.status(400).json({ error: "Minimum deposit amount is 200 COIN." });
      }

      user.activationRequest = {
        txid,
        notes: notes || '',
        payDate,
        payTime,
        screenshot,
        depositAmount: parsedAmount,
        status: 'Pending',
        createdAt: new Date()
      };
      user.status = 'Pending Verification';
      await user.save();

      io.to('admin_room').emit('new_deposit_request', { userId: user.userId, name: user.name, txid, amount: parsedAmount });
      broadcastAdminStats();
      res.json({ success: true, message: "Deposit proof submitted. Admin will verify within 24 hours." });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ======== NEW DEPOSIT SYSTEM ========

  app.post('/api/user/deposit-request', authenticateToken, async (req, res) => {
    try {
      const { amount, txid, screenshot } = req.body;
      const user = await User.findById(req.user.id);
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount < 200) return res.status(400).json({ error: 'Minimum deposit amount is 200 COIN.' });
      if (!txid || txid.trim().length < 5) return res.status(400).json({ error: 'A valid Transaction Hash (TXID) is required.' });
      const existing = await DepositRequest.findOne({ txid: txid.trim() });
      if (existing) return res.status(400).json({ error: 'This Transaction Hash has already been submitted. Duplicate deposits are not allowed.' });

      let finalScreenshot = screenshot || '';
      if (finalScreenshot && finalScreenshot.startsWith('data:image')) {
        try {
          const uploadRes = await cloudinary.uploader.upload(finalScreenshot, {
            folder: 'blu_deposits'
          });
          finalScreenshot = uploadRes.secure_url;
        } catch (err) {
          console.error('[Cloudinary Upload Error]', err);
          // Fallback to saving raw base64 if cloudinary fails or isn't configured properly
        }
      }

      await DepositRequest.create({
        id: 'DEP-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase(),
        userId: user._id, userPublicId: user.userId, userName: user.name, userEmail: user.email,
        amount: parsedAmount, txid: txid.trim(), screenshot: finalScreenshot, status: 'Pending', createdAt: new Date()
      });
      io.to('admin_room').emit('new_deposit_request', { userId: user.userId, name: user.name, txid, amount: parsedAmount });
      broadcastAdminStats();
      res.json({ success: true, message: 'Your deposit request has been submitted and is awaiting admin approval.' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/user/deposit-history', authenticateToken, async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      const deposits = await DepositRequest.find({ userId: user._id }).sort({ createdAt: -1 });
      res.json(deposits);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/admin/deposit-requests', authenticateToken, adminOnly, async (req, res) => {
    try {
      const deposits = await DepositRequest.find({}).sort({ createdAt: -1 });
      res.json(deposits);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/admin/approve-deposit-request', authenticateToken, adminOnly, async (req, res) => {
    try {
      const { depositId, remarks } = req.body;
      const depReq = await DepositRequest.findById(depositId);
      if (!depReq) return res.status(404).json({ error: 'Deposit request not found.' });
      if (depReq.status !== 'Pending') return res.status(400).json({ error: 'This request has already been processed.' });
      const user = await User.findById(depReq.userId);
      if (!user) return res.status(404).json({ error: 'User not found.' });
      const timestamp = new Date();
      await Transaction.create({
        txid: 'DEP-' + Math.random().toString(36).substr(2, 8).toUpperCase(),
        userId: user._id, type: 'credit', walletType: 'fund', status: 'Approved', category: 'USDT Deposit',
        note: `Deposit approved: {depReq.amount.toFixed(2)} USDT — ${remarks || 'Verified by Admin'}`,
        amount: depReq.amount, date: timestamp
      });
      depReq.status = 'Approved'; depReq.remarks = remarks || 'Approved by Admin'; depReq.processedAt = timestamp;
      await depReq.save();
      await Notification.create({ id: 'not-' + Date.now(), userId: user._id.toString(), message: `✅ Your deposit of {depReq.amount.toFixed(2)} USDT has been approved and credited to your wallet.`, time: timestamp });
      io.to(user._id.toString()).emit('notification', { message: `Deposit of {depReq.amount.toFixed(2)} approved and credited!` });
      io.to(user._id.toString()).emit('balance_update');
      broadcastAdminStats();
      res.json({ success: true, message: `Deposit approved. {depReq.amount.toFixed(2)} credited to ${user.userId}.` });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/admin/reject-deposit-request', authenticateToken, adminOnly, async (req, res) => {
    try {
      const { depositId, remarks } = req.body;
      const depReq = await DepositRequest.findById(depositId);
      if (!depReq) return res.status(404).json({ error: 'Deposit request not found.' });
      if (depReq.status !== 'Pending') return res.status(400).json({ error: 'This request has already been processed.' });
      const user = await User.findById(depReq.userId);
      depReq.status = 'Rejected'; depReq.remarks = remarks || 'Rejected by Admin'; depReq.processedAt = new Date();
      await depReq.save();
      if (user) {
        await Notification.create({ id: 'not-' + Date.now(), userId: user._id.toString(), message: `❌ Your deposit request of {depReq.amount.toFixed(2)} has been rejected. Reason: ${remarks || 'Unverified'}`, time: new Date() });
        io.to(user._id.toString()).emit('notification', { message: `Your deposit request has been rejected.` });
      }
      broadcastAdminStats();
      res.json({ success: true, message: 'Deposit request rejected.' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/admin/deposit-requests/processed', authenticateToken, adminOnly, async (req, res) => {
    try {
      const result = await DepositRequest.deleteMany({ status: { $in: ['Approved', 'Rejected'] } });
      broadcastAdminStats();
      res.json({ success: true, message: `Successfully deleted ${result.deletedCount} processed deposit requests and their attached screenshots to free up storage.` });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ======== END NEW DEPOSIT SYSTEM ========

  app.post('/api/user/activate-id', authenticateToken, async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (user.status === 'Active' || user.idStatus === 'Activated') {
        return res.status(400).json({ error: "Your account is already activated." });
      }
      const balance = await calculateFundBalance(user._id);
      if (balance < 1000) return res.status(400).json({ error: "Fund balance insufficient." });

      const timestamp = new Date();
      await Transaction.create({
        txid: "ACT-" + Math.random().toString(36).substr(2, 7).toUpperCase(),
        userId: user._id,
        type: "debit",
        walletType: "fund",
        status: "Approved",
        category: "ID Activation",
        note: "Self Node ID Activation",
        amount: 1000,
        date: timestamp
      });

      user.status = 'Active';
      user.verificationStatus = 'Verified';
      user.idStatus = 'Activated';
      user.activationApproval = {
        approvedDate: timestamp,
        remarks: "Deducted 1000 COIN for Activation",
        adminId: "SYSTEM"
      };
      await user.save();

      await awardMlmCommissions(user, timestamp);
      // Automatic Boosting Matrix Placement (50 COIN implicit pool)
      await placeInBoostingMatrix(user._id, user.parentReferral, false);
      // Seed Auto Blaster levels for activated user
      await seedAutoBlasterForUser(user._id, timestamp);
      broadcastAdminStats();
      res.json({ success: true, message: "Activated successfully." });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/user/withdraw', authenticateToken, async (req, res) => {
    try {
      const { amount, destination, pin } = req.body;
      const user = await User.findById(req.user.id);
      if (user.txPassword !== pin) return res.status(400).json({ error: "PIN incorrect." });
      if (amount < 200) return res.status(400).json({ error: "Minimum is 200 COIN." });

      const balance = await calculateUserBalance(user._id);
      if (balance < amount) return res.status(400).json({ error: "Insufficient balance." });

      // Safeguard removed: We now deduct the balance immediately by creating a transaction,
      // so calculateUserBalance will naturally reflect the deducted amount.

      const wthId = "WTH-" + Math.random().toString(36).substr(2, 7).toUpperCase();

      await Withdrawal.create({
        id: wthId,
        userId: user._id,
        amount,
        destination,
        status: 'Pending'
      });

      // Deduct balance immediately
      await Transaction.create({
        txid: wthId,
        userId: user._id,
        type: "debit",
        status: "Approved",
        walletType: "income",
        category: "Withdrawal",
        note: `Withdrawal request to ${destination}`,
        amount: amount,
        date: new Date()
      });

      io.to('admin_room').emit('new_withdrawal_request', { userId: user.userId, amount });
      broadcastAdminStats();
      res.json({ success: true, message: "Withdrawal requested." });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // User Lookup endpoint — for P2P receiver live resolution
  app.get('/api/user/lookup/:userId', authenticateToken, async (req, res) => {
    try {
      const searchTerm = req.params.userId.trim();
      // Search by userId (case-insensitive) OR by email (exact match)
      let found = await User.findOne({ userId: searchTerm.toUpperCase() });
      if (!found) {
        found = await User.findOne({ email: searchTerm });
      }
      if (!found) return res.status(404).json({ error: 'User not found. Enter a valid User ID (e.g. BLU000026) or registered email.' });
      // Never expose password, only safe public info
      res.json({ userId: found.userId, name: found.name, status: found.status });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

    app.post('/api/user/p2p-transfer', authenticateToken, async (req, res) => {
    try {
      console.log('[P2P DEBUG] Request received:', JSON.stringify(req.body));
      const { targetUserId, sourceWallet, pin } = req.body;
      const amount = parseFloat(req.body.amount);
      console.log('[P2P DEBUG] Parsed - targetUserId:', targetUserId, 'amount:', amount, 'sourceWallet:', sourceWallet);

      // --- VALIDATION 1: Required fields ---
      if (!targetUserId || typeof targetUserId !== 'string') {
        return res.status(400).json({ error: 'Receiver User ID is required.' });
      }
      if (isNaN(amount) || amount < 1) {
        return res.status(400).json({ error: 'Minimum transfer amount is 1 COIN.' });
      }

      // --- VALIDATION 2: Sender exists and is Active ---
      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ error: 'Sender account not found.' });
      
      // --- VALIDATION 3: Transaction Password ---
      if (user.txPassword !== pin) {
        return res.status(400).json({ error: 'Transaction Password (PIN) is incorrect.' });
      }

      if (user.status !== 'Active') {
        return res.status(400).json({ error: 'Your account must be Active to send P2P transfers.' });
      }
      console.log('[P2P DEBUG] Sender found:', user._id, user.userId, user.status);

      // --- VALIDATION 4: Self-transfer check ---
      const cleanTargetId = targetUserId.trim().toUpperCase();
      if (user.userId.toUpperCase() === cleanTargetId) {
        return res.status(400).json({ error: 'You cannot transfer funds to your own account.' });
      }

      // --- VALIDATION 5: Receiver exists ---
      // Find by userId field (public ID like BLU000008)
      const allUsers = await User.find({});
      const recipient = allUsers.find(u => u.userId && u.userId.toUpperCase() === cleanTargetId);
      if (!recipient) {
        return res.status(404).json({ error: `User '${cleanTargetId}' not found. Please check the User ID.` });
      }
      console.log('[P2P DEBUG] Receiver found:', recipient._id, recipient.userId, recipient.status);

      // --- VALIDATION 6: Fund balance check ---
      const actualSourceWallet = (sourceWallet === 'income') ? 'income' : 'fund';
      let senderBalance = 0;
      if (actualSourceWallet === 'fund') {
        senderBalance = await calculateFundBalance(user._id);
      } else {
        senderBalance = await calculateUserBalance(user._id);
      }
      if (senderBalance < amount) {
        return res.status(400).json({ error: `Insufficient ${actualSourceWallet} wallet balance. Available: ${senderBalance.toFixed(2)}` });
      }
      console.log('[P2P DEBUG] Balance check passed. senderBalance:', senderBalance, 'amount:', amount);

      // --- VALIDATION 7: Duplicate prevention (60 seconds) ---
      const oneMinuteAgo = Date.now() - 60000;
      const allUserDebits = await Transaction.find({
        userId: user._id,
        category: 'P2P Transfer',
        type: 'debit'
      });
      const recentTx = allUserDebits.find(t => {
        const txTime = new Date(t.date).getTime();
        return t.amount === amount && txTime >= oneMinuteAgo;
      });
      if (recentTx) {
        return res.status(400).json({ error: 'Duplicate transaction detected. Please wait 60 seconds before sending the same amount again.' });
      }

      console.log('[P2P DEBUG] Duplicate check passed. Executing transfer...');
      const timestamp = new Date();
      const transferGroupId = 'P2P-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2,4).toUpperCase();
      const senderTxId = transferGroupId + '-S';
      const receiverTxId = transferGroupId + '-R';

      // Debit sender
      await Transaction.create({
        txid: senderTxId,
        userId: user._id,
        type: 'debit',
        walletType: actualSourceWallet,
        status: 'Approved',
        category: 'P2P Transfer',
        note: '[' + transferGroupId + '] Sent to ' + recipient.name + ' (' + recipient.userId + ')',
        amount: amount,
        date: timestamp
      });

      // Credit receiver
      await Transaction.create({
        txid: receiverTxId,
        userId: recipient._id,
        type: 'credit',
        walletType: 'fund',
        status: 'Approved',
        category: 'P2P Transfer',
        note: '[' + transferGroupId + '] Received from ' + user.name + ' (' + user.userId + ')',
        amount: amount,
        date: timestamp
      });

      // Notifications
      try {
        await Notification.create({ id: 'NOT-' + Date.now(), userId: user._id.toString(), message: 'P2P Transfer of $' + amount.toFixed(2) + ' sent to ' + recipient.name, time: timestamp });
        await Notification.create({ id: 'NOT-' + (Date.now()+1), userId: recipient._id.toString(), message: 'P2P Transfer of $' + amount.toFixed(2) + ' received from ' + user.name, time: timestamp });
      } catch(notifErr) { /* non-fatal */ }

      // Real-time socket updates
      try {
        io.to(user._id.toString()).emit('balance_update');
        io.to(recipient._id.toString()).emit('balance_update');
        io.to(recipient._id.toString()).emit('notification', { message: 'You received $' + amount.toFixed(2) + ' from ' + user.name });
      } catch(sockErr) { /* non-fatal */ }

      const newSenderBalance = senderBalance - amount;
      
      return res.json({
        success: true,
        status: "success",
        transferId: transferGroupId,
        message: 'Transfer successful',
        newBalance: newSenderBalance
      });

    } catch (e) {
      console.error('[P2P Error]', e);
      res.status(500).json({ error: 'Server error: ' + e.message });
    }
  });

  // P2P Transfer History for current user
  app.get('/api/user/p2p-history', authenticateToken, async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      const allP2P = await Transaction.find({ category: 'P2P Transfer', status: 'Approved' });

      const sent = allP2P
        .filter(t => t.userId && t.userId.toString() === user._id.toString() && t.type === 'debit')
        .map(t => {
          let transferId = t.txid;
          let receiverName = 'Unknown';
          let receiverId = 'Unknown';

          const oldMatch = t.note.match(/\[(.+?)\] Sent to (.+?) \((.+?)\)/);
          if (oldMatch) {
            transferId = oldMatch[1];
            receiverName = oldMatch[2];
            receiverId = oldMatch[3];
          } else {
            const newMatch = t.note.match(/(.+) \((.+)\)/);
            if (newMatch) {
              receiverName = newMatch[1];
              receiverId = newMatch[2];
            }
          }

          return {
            txid: transferId,
            receiverName: receiverName,
            receiverId: receiverId,
            amount: t.amount,
            date: t.date,
            status: 'Success'
          };
        });

      const received = allP2P
        .filter(t => t.userId && t.userId.toString() === user._id.toString() && t.type === 'credit')
        .map(t => {
          let transferId = t.txid;
          let senderName = 'Unknown';
          let senderId = 'Unknown';

          const oldMatch = t.note.match(/\[(.+?)\] Received from (.+?) \((.+?)\)/);
          if (oldMatch) {
            transferId = oldMatch[1];
            senderName = oldMatch[2];
            senderId = oldMatch[3];
          } else {
            const newMatch = t.note.match(/(.+) \((.+)\)/);
            if (newMatch) {
              senderName = newMatch[1];
              senderId = newMatch[2];
            }
          }

          return {
            txid: transferId,
            senderName: senderName,
            senderId: senderId,
            amount: t.amount,
            date: t.date,
            status: 'Success'
          };
        });

      res.json({ sent, received });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Admin: All P2P Transfers
  app.get('/api/admin/p2p-transfers', authenticateToken, adminOnly, async (req, res) => {
    try {
      const allP2P = await Transaction.find({ category: 'P2P Transfer', type: 'debit', status: 'Approved' });
      const allUsers = await User.find({});
      const userMap = {};
      allUsers.forEach(u => { userMap[u._id] = u; });

      const transfers = allP2P.map(t => {
        const sender = userMap[t.userId];
        
        let transferId = t.txid;
        let receiverName = 'Unknown';
        let receiverId = 'Unknown';

        // Try old format: "[P2P-123] Sent to John Doe (BLU001)"
        const oldMatch = t.note.match(/\[(.+?)\] Sent to (.+?) \((.+?)\)/);
        if (oldMatch) {
          transferId = oldMatch[1];
          receiverName = oldMatch[2];
          receiverId = oldMatch[3];
        } else {
          // Try new format: "John Doe (BLU001)"
          const newMatch = t.note.match(/(.+) \((.+)\)/);
          if (newMatch) {
            receiverName = newMatch[1];
            receiverId = newMatch[2];
          }
        }

        return {
          transferId: transferId,
          senderName: sender ? sender.name : 'Unknown',
          senderId: sender ? sender.userId : 'Unknown',
          receiverName: receiverName,
          receiverId: receiverId,
          amount: t.amount,
          date: t.date,
          status: 'Success',
          walletType: t.walletType || 'fund'
        };
      });

      transfers.sort((a, b) => new Date(b.date) - new Date(a.date));

      const istOffsetMs = 5.5 * 60 * 60 * 1000;
      const istTime = new Date(Date.now() + istOffsetMs);
      istTime.setUTCHours(0, 0, 0, 0);
      const startOfDay = new Date(istTime.getTime() - istOffsetMs);
      const todayTransfers = transfers.filter(t => new Date(t.date) >= startOfDay);
      const totalCoins = transfers.reduce((sum, t) => sum + t.amount, 0);

      res.json({
        transfers,
        stats: {
          totalTransfers: transfers.length,
          totalCoins,
          todayTransfers: todayTransfers.length,
          todayCoins: todayTransfers.reduce((sum, t) => sum + t.amount, 0)
        }
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/user/internal-transfer', authenticateToken, async (req, res) => {
    try {
      const { amount, pin } = req.body;
      const user = await User.findById(req.user.id);
      if (user.txPassword !== pin) return res.status(400).json({ error: "PIN incorrect." });

      const incomeBalance = await calculateUserBalance(user._id);
      if (incomeBalance < amount) return res.status(400).json({ error: "Insufficient Income Balance." });

      const timestamp = new Date();
      // Debit from Income Wallet
      await Transaction.create({
        txid: "ITD-" + Math.random().toString(36).substr(2, 7).toUpperCase(),
        userId: user._id,
        type: "debit",
        walletType: "income",
        status: "Approved",
        category: "Internal Transfer",
        note: "Transferred to Fund Wallet",
        amount,
        date: timestamp
      });

      // Credit to Fund Wallet
      await Transaction.create({
        txid: "ITC-" + Math.random().toString(36).substr(2, 7).toUpperCase(),
        userId: user._id,
        type: "credit",
        walletType: "fund",
        status: "Approved",
        category: "Internal Transfer",
        note: "Received from Income Wallet",
        amount,
        date: timestamp
      });

      io.to(user._id.toString()).emit('balance_update');
      
      res.json({ success: true, message: `Successfully converted ${amount.toFixed(2)} to Fund Wallet.` });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/user/ticket', authenticateToken, async (req, res) => {
    try {
      const { category, description, screenshot } = req.body;
      const user = await User.findById(req.user.id);
      const tktId = "TKT-" + Math.random().toString(36).substr(2, 7).toUpperCase();

      await Ticket.create({
        id: tktId,
        userId: user._id,
        category,
        description,
        screenshot: screenshot || "",
        chat: []
      });

      res.json({ success: true, message: "Ticket created." });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/user/ticket-reply', authenticateToken, async (req, res) => {
    try {
      const { ticketId, replyText } = req.body;
      const user = await User.findById(req.user.id);
      
      const ticket = await Ticket.findOne({ id: ticketId, userId: user._id });
      if (!ticket) return res.status(404).json({ error: "Ticket not found." });
      
      if (ticket.status === 'Closed') return res.status(400).json({ error: "Cannot reply to a closed ticket." });

      ticket.chat.push({ sender: 'User', text: replyText });
      // If the ticket was resolved but user replied, maybe set it back to In Progress
      if (ticket.status === 'Resolved') ticket.status = 'In Progress';
      
      await ticket.save();

      res.json({ success: true, message: "Reply sent." });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/user/clear-notifications', authenticateToken, async (req, res) => {
    try {
      await Notification.deleteMany({ userId: req.user.id });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========================================================================
  // ADMIN PORTAL — Serve admin.html at /admin
  // ========================================================================
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
  });

  // Dedicated Admin Portal Login (separate from user login)
  // Credentials: username=admin  password=admin
  app.post('/api/admin/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: 'Credentials required.' });

      if (!dbData.adminPortal || dbData.adminPortal.length === 0) {
        return res.status(500).json({ error: 'Admin portal not initialised.' });
      }

      const adminRecord = dbData.adminPortal.find(a => a.username === username.trim().toLowerCase());
      if (!adminRecord) return res.status(401).json({ error: 'Invalid credentials.' });

      const match = await bcrypt.compare(password, adminRecord.password);
      if (!match) return res.status(401).json({ error: 'Invalid credentials.' });

      // Issue a JWT valid 24h for admin portal
      const token = jwt.sign(
        { id: 'ADMIN001', role: 'admin', userId: 'ADMIN001', username: adminRecord.username },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({ success: true, token, username: adminRecord.username });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Change admin portal password
  app.post('/api/admin/auth/change-password', authenticateToken, adminOnly, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both fields required.' });
      const adminRecord = dbData.adminPortal.find(a => a.username === 'admin');
      if (!adminRecord) return res.status(404).json({ error: 'Admin not found.' });
      const match = await bcrypt.compare(currentPassword, adminRecord.password);
      if (!match) return res.status(401).json({ error: 'Current password incorrect.' });
      adminRecord.password = await bcrypt.hash(newPassword, 12);
      saveLocalDb();
      res.json({ success: true, message: 'Password updated successfully.' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Admin APIs
  app.get('/api/admin/dashboard', authenticateToken, adminOnly, async (req, res) => {
    try {
      const totalUsers = await User.countDocuments();
      const activeUsers = await User.countDocuments({ status: 'Active' });
      const pendingUsers = await User.countDocuments({ 
        $or: [{ status: 'Pending Verification' }, { "activationRequest.status": "Pending" }]
      });
      const deposits = await Transaction.find({ type: 'credit', status: 'Approved', category: 'USDT Deposit' });
      const totalDeposits = deposits.reduce((acc, t) => acc + t.amount, 0);
      const withdrawals = await Withdrawal.find({ status: 'Completed' });
      const totalWithdrawals = withdrawals.reduce((acc, w) => acc + w.amount, 0);
      const totalSupportTickets = await Ticket.countDocuments();
      const activatedUsersCount = await User.countDocuments({ idStatus: 'Activated' });
      const totalGrossRevenue = activatedUsersCount * 1000;
      const totalCycledBoards = await BoostingBoard.countDocuments({ isCycled: true });
      const companyReserve = totalCycledBoards * 100; // 100 COIN reserve per cycle

      res.json({ totalUsers, activeUsers, pendingUsers, totalDeposits, totalWithdrawals, totalSupportTickets, totalGrossRevenue, companyReserve });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/admin/context', authenticateToken, adminOnly, async (req, res) => {
    try {
      const users = await User.find().sort({ userId: 1 });
      const withdrawals = await Withdrawal.find().sort({ createdAt: -1 });
      const tickets = await Ticket.find().populate('userId').sort({ createdAt: -1 });
      const dbTransactions = await Transaction.find().populate('userId').sort({ date: -1 });
      // Fetch all auto blaster rewards for admin view
      const allAutoBlaster = await AutoBlasterReward.find().populate('userId').sort({ createdAt: -1 }).limit(500);

      const auditLogs = [];
      dbTransactions.forEach(t => {
        if (t.userId) {
          auditLogs.push({
            txid: t.txid,
            userId: t.userId.userId,
            name: t.userId.name,
            email: t.userId.email,
            category: t.category,
            amount: t.amount,
            type: t.type,
            date: t.date,
            status: t.status,
            note: t.note
          });
        }
      });

      const rewardClaims = allAutoBlaster.map(r => ({
        id: r._id,
        level: r.level,
        reward: r.reward,
        status: r.status,
        releaseDate: r.releaseDate,
        transferred: r.transferred,
        transferHistory: r.transferHistory,
        userInfo: r.userId ? {
          userId: r.userId.userId,
          name: r.userId.name,
          email: r.userId.email,
          mobile: r.userId.mobile
        } : { userId: 'Unknown', name: 'Unknown', email: '?', mobile: '?' }
      }));

      res.json({
        users: await Promise.all(users.map(async u => {
          const balance = await calculateUserBalance(u._id);
          const fundBalance = await calculateFundBalance(u._id);
          const income = await calculateIncomeBreakdown(u._id);
          const directs = await User.find({ parentReferral: u.userId });
          const activeDirects = directs.filter(d => d.status === 'Active').length;
          const abRewards = await AutoBlasterReward.find({ userId: u._id });
          const abBalance = abRewards.reduce((s,r) => s + (r.reward - r.transferred), 0);
          const activationDate = u.activationApproval?.approvedDate || null;
          return { 
            dbId: u._id ? u._id.toString() : (u.id ? u.id.toString() : ''), 
            rawId: typeof u._id,
            rawObj: JSON.stringify(u.toObject ? u.toObject() : u),
            userId: u.userId, 
            name: u.name, 
            email: u.email, 
            mobile: u.mobile, 
            password: u.plainPassword || '(Hidden/Old)',
            role: u.role, 
            status: u.status, 
            idStatus: u.idStatus, 
            parentReferral: u.parentReferral, 
            referralCode: u.referralCode, 
            activationDate,
            totalDirects: directs.length,
            activeDirects,
            balance, 
            fundBalance,
            abBalance,
            incomeBreakdown: income,
            earnings: income.total 
          };
        })),
        withdrawals: await Promise.all(withdrawals.map(async w => {
          let user = null;
          try {
            if (mongoose.Types.ObjectId.isValid(w.userId)) user = await User.findById(w.userId);
            else user = await User.findOne({ userId: w.userId });
          } catch(e) {}
          return { id: w.id, userId: user ? user.userId : (w.userId || 'BLU000000'), name: user ? user.name : 'Unknown', mobile: user ? user.mobile : '', email: user ? user.email : '', amount: w.amount, destination: w.destination, createdAt: w.createdAt, status: w.status };
        })),
        tickets: await Promise.all(tickets.map(async t => {
          let ticketUser = null;
          try {
            if (mongoose.Types.ObjectId.isValid(t.userId)) ticketUser = await User.findById(t.userId);
            else ticketUser = await User.findOne({ userId: t.userId });
          } catch(e) {}
          return {
            ...JSON.parse(JSON.stringify(t)),
            userInfo: ticketUser ? {
              userId: ticketUser.userId,
              name: ticketUser.name,
              email: ticketUser.email,
              mobile: ticketUser.mobile
            } : { userId: 'Unknown', name: 'Unknown', email: '—', mobile: '—' }
          };
        })),
        auditLogs,
        rewardClaims: rewardClaims.map(r => ({
          ...JSON.parse(JSON.stringify(r)),
          userInfo: r.userId ? {
            userId: r.userId.userId,
            name: r.userId.name,
            email: r.userId.email,
            mobile: r.userId.mobile
          } : { userId: 'Unknown', name: 'Unknown', email: '?', mobile: '?' }
        }))
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/admin/activations-pending', authenticateToken, adminOnly, async (req, res) => {
    try {
      const pendingUsers = await User.find({
        $or: [{ status: 'Pending Verification' }, { "activationRequest.status": 'Pending' }]
      });
      res.json(pendingUsers);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/approve-deposit', authenticateToken, adminOnly, async (req, res) => {
    try {
      const { userId, remarks } = req.body;
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: 'User not found.' });

      const req_data = user.activationRequest || {};
      const depositAmount = parseFloat(req_data.depositAmount) || 1000;
      const timestamp = new Date();

      // Mark activation request as approved
      if (user.activationRequest) user.activationRequest.status = 'Approved';

      // Credit the full deposited amount to user's Fund Wallet
      await Transaction.create({
        txid: "DEP-" + Math.random().toString(36).substr(2, 7).toUpperCase(),
        userId: user._id,
        type: "credit",
        walletType: "fund",
        status: "Approved",
        category: "USDT Deposit",
        note: `Approved deposit ${depositAmount.toFixed(2)} USDT — ${remarks || 'Verified'}`,  
        amount: depositAmount,
        date: timestamp
      });

      // Deduct 100 COIN0 activation fee immediately
      await Transaction.create({
        txid: "ACT-" + Math.random().toString(36).substr(2, 7).toUpperCase(),
        userId: user._id,
        type: "debit",
        status: "Approved",
        category: "ID Activation",
        note: "Node ID Activation Fee (1000 COIN)",
        amount: 1000,
        date: timestamp
      });

      // AUTO-ACTIVATE: Set user to Active immediately
      user.status = 'Active';
      user.verificationStatus = 'Verified';
      user.idStatus = 'Activated';
      user.activationApproval = {
        approvedDate: timestamp,
        remarks: remarks || 'Approved & Activated by Admin',
        adminId: req.user.userId || 'ADMIN'
      };
      await user.save();

      // Fire MLM 3-level commission distribution
      await awardMlmCommissions(user, timestamp);
      // Automatic Boosting Matrix Placement (50 COIN implicit pool)
      await placeInBoostingMatrix(user._id, user.parentReferral, false);
      // Seed Auto Blaster levels for activated user
      await seedAutoBlasterForUser(user._id, timestamp);

      // Notify user of activation
      await Notification.create({
        id: "not-" + Date.now(),
        userId: user._id.toString(),
        message: `🎉 Your account is now ACTIVE! Deposit of ${depositAmount.toFixed(2)} approved. Activation fee 1000 COIN deducted. ${depositAmount > 1000 ? `Remaining balance: ${(depositAmount - 1000).toFixed(2)}` : ''} Your referral system is now unlocked!`,  
        time: timestamp
      });

      io.to(user._id.toString()).emit('notification', { message: `Account Activated! Your referral network is now live.` });
      io.to(user._id.toString()).emit('balance_update');
      broadcastAdminStats();
      res.json({ success: true, message: `User ${user.userId} activated successfully. MLM commissions distributed.` });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/reject-deposit', authenticateToken, adminOnly, async (req, res) => {
    try {
      const { userId, remarks } = req.body;
      const user = await User.findById(userId);
      user.status = 'Inactive';
      user.activationRequest = null;
      await user.save();

      await Notification.create({
        id: "not-" + Date.now(),
        userId: user._id.toString(),
        message: `Deposit request rejected. Reason: ${remarks}`,
        time: new Date()
      });

      io.to(user._id.toString()).emit('notification', { message: `Deposit request rejected.` });
      broadcastAdminStats();
      res.json({ success: true, message: "Rejected successfully." });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/adjust-balance', authenticateToken, adminOnly, async (req, res) => {
    try {
      const { userId, targetBalance } = req.body;
      const user = await User.findById(userId);
      const current = await calculateUserBalance(user._id);
      const diff = targetBalance - current;
      if (diff !== 0) {
        await Transaction.create({
          txid: "SYS-" + Math.random().toString(36).substr(2, 7).toUpperCase(),
          userId: user._id,
          type: diff > 0 ? "credit" : "debit",
          status: "Approved",
          category: diff > 0 ? "Auto Income" : "Withdrawal",
          amount: Math.abs(diff)
        });
        io.to(user._id.toString()).emit('balance_update');
      }
      res.json({ success: true, message: "Balance adjusted." });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/edit-profile', authenticateToken, adminOnly, async (req, res) => {
    try {
      const { id, name, email, mobile, parentReferral, role, password } = req.body;
      const user = mongoose.Types.ObjectId.isValid(id) ? await User.findById(id) : await User.findOne({ userId: id });
      if (!user) return res.status(404).json({ error: "User not found." });
      user.name = name;
      user.email = email;
      user.mobile = mobile;
      user.parentReferral = parentReferral;
      user.role = role;
      if (password) user.password = await bcrypt.hash(password, 10);
      await user.save();
      res.json({ success: true, message: "Profile updated." });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/toggle-suspension', authenticateToken, adminOnly, async (req, res) => {
    try {
      const user = mongoose.Types.ObjectId.isValid(req.body.userId) ? await User.findById(req.body.userId) : await User.findOne({ userId: req.body.userId });
      if (!user) return res.status(404).json({ error: "User not found." });
      user.status = user.status === 'Suspended' ? (user.idStatus === 'Activated' ? 'Active' : 'Inactive') : 'Suspended';
      await user.save();
      res.json({ success: true, status: user.status });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/admin/users/all', authenticateToken, adminOnly, async (req, res) => {
    try {
      const nonAdmins = await User.find({ role: { $ne: 'admin' } });
      const nonAdminIds = nonAdmins.map(u => u._id);
      
      await User.deleteMany({ _id: { $in: nonAdminIds } });
      await Transaction.deleteMany({ userId: { $in: nonAdminIds } });
      await BoostingBoard.deleteMany({ ownerId: { $in: nonAdminIds } });
      await Withdrawal.deleteMany({ userId: { $in: nonAdminIds } });
      await Log.deleteMany({ userId: { $in: nonAdminIds } });

      res.json({ success: true, message: 'All non-admin users deleted.' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to delete all users." });
    }
  });

  app.delete('/api/admin/user/:id', authenticateToken, adminOnly, async (req, res) => {
    try {
      const user = mongoose.Types.ObjectId.isValid(req.params.id) ? await User.findById(req.params.id) : await User.findOne({ userId: req.params.id });
      if (!user) return res.status(404).json({ error: "User not found." });
      await User.findByIdAndDelete(user._id);
      await Transaction.deleteMany({ userId: user._id });
      await Withdrawal.deleteMany({ userId: user._id });
      await Ticket.deleteMany({ userId: user._id });
      res.json({ success: true, message: "User deleted." });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });


  // ============================================================
  // ADMIN FUND MANAGEMENT API
  // ============================================================
  app.post('/api/admin/fund-management', authenticateToken, adminOnly, async (req, res) => {
    try {
      const { targetUserId, actionType, amount, walletType, remark } = req.body;
      let targetUser;
      if (require('mongoose').Types.ObjectId.isValid(targetUserId)) {
        targetUser = await User.findById(targetUserId);
      }
      if (!targetUser) {
        targetUser = await User.findOne({ userId: targetUserId });
      }
      if (!targetUser) return res.status(404).json({ error: "User not found." });

      const parsedAmount = parseFloat(amount);
      if (['add', 'deduct', 'transfer_to_income', 'transfer_to_fund'].includes(actionType) && (isNaN(parsedAmount) || parsedAmount <= 0)) {
        return res.status(400).json({ error: "Valid positive amount is required." });
      }

      const adminName = req.user.username || 'Admin';
      const generateTxId = () => "ADM-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4).toUpperCase();

      // Reusable log function
      const createAuditLog = async (action, amountVal, fromW, toW, oldB, newB, rem) => {
        await Transaction.create({
          txid: generateTxId(),
          userId: targetUser._id,
          type: "audit",
          status: "Approved",
          category: "Admin Fund Management",
          walletType: "income", // changed from "none" to pass schema validation
          amount: amountVal,
          note: `[${action}] ${rem} | Admin: ${adminName} | Old: ${oldB.toFixed(2)} | New: ${newB.toFixed(2)} | From: ${fromW} | To: ${toW}`,
          date: new Date()
        });
      };

      if (actionType === 'add') {
        const oldBalance = walletType === 'fund' ? await calculateFundBalance(targetUser._id) : await calculateUserBalance(targetUser._id);
        await Transaction.create({
          txid: generateTxId(),
          userId: targetUser._id,
          type: "credit",
          status: "Approved",
          category: "Admin Adjustment",
          walletType: walletType === 'fund' ? 'fund' : 'income',
          amount: parsedAmount,
          note: remark || "Funds added by Administrator.",
          date: new Date()
        });
        const newBalance = walletType === 'fund' ? await calculateFundBalance(targetUser._id) : await calculateUserBalance(targetUser._id);
        await createAuditLog('ADD', parsedAmount, 'N/A', walletType, oldBalance, newBalance, remark || '');
        
      } else if (actionType === 'deduct') {
        const oldBalance = walletType === 'fund' ? await calculateFundBalance(targetUser._id) : await calculateUserBalance(targetUser._id);
        if (oldBalance < parsedAmount) {
          return res.status(400).json({ error: `Insufficient ${walletType} balance to deduct ${parsedAmount.toFixed(2)}.` });
        }
        await Transaction.create({
          txid: generateTxId(),
          userId: targetUser._id,
          type: "debit",
          status: "Approved",
          category: "Admin Adjustment",
          walletType: walletType === 'fund' ? 'fund' : 'income',
          amount: parsedAmount,
          note: remark || "Funds deducted by Administrator.",
          date: new Date()
        });
        const newBalance = walletType === 'fund' ? await calculateFundBalance(targetUser._id) : await calculateUserBalance(targetUser._id);
        await createAuditLog('DEDUCT', parsedAmount, walletType, 'N/A', oldBalance, newBalance, remark || '');

      } else if (actionType === 'edit') {
        const oldBalance = walletType === 'fund' ? await calculateFundBalance(targetUser._id) : await calculateUserBalance(targetUser._id);
        const difference = parsedAmount - oldBalance;
        
        if (difference !== 0) {
          await Transaction.create({
            txid: generateTxId(),
            userId: targetUser._id,
            type: difference > 0 ? "credit" : "debit",
            status: "Approved",
            category: "Admin Edit",
            walletType: walletType === 'fund' ? 'fund' : 'income',
            amount: Math.abs(difference),
            note: remark || `Administrator explicitly edited balance to ${parsedAmount.toFixed(2)}.`,
            date: new Date()
          });
          const newBalance = walletType === 'fund' ? await calculateFundBalance(targetUser._id) : await calculateUserBalance(targetUser._id);
          await createAuditLog('EDIT', parsedAmount, walletType, walletType, oldBalance, newBalance, remark || `Forced balance to ${parsedAmount}`);
        }

      } else if (actionType === 'transfer_to_income' || actionType === 'transfer_to_fund') {
        const isToIncome = actionType === 'transfer_to_income';
        const sourceWallet = isToIncome ? 'fund' : 'income';
        const destWallet = isToIncome ? 'income' : 'fund';
        
        const oldSourceBalance = sourceWallet === 'fund' ? await calculateFundBalance(targetUser._id) : await calculateUserBalance(targetUser._id);
        const oldDestBalance = destWallet === 'fund' ? await calculateFundBalance(targetUser._id) : await calculateUserBalance(targetUser._id);

        if (oldSourceBalance < parsedAmount) {
          return res.status(400).json({ error: `Insufficient ${sourceWallet} balance for transfer.` });
        }

        // Debit source
        await Transaction.create({
          txid: generateTxId(),
          userId: targetUser._id,
          type: "debit",
          status: "Approved",
          category: "Admin Transfer",
          walletType: sourceWallet,
          amount: parsedAmount,
          note: `Transferred ${parsedAmount} to ${destWallet} by Admin.`,
          date: new Date()
        });

        // Credit destination
        await Transaction.create({
          txid: generateTxId(),
          userId: targetUser._id,
          type: "credit",
          status: "Approved",
          category: "Admin Transfer",
          walletType: destWallet,
          amount: parsedAmount,
          note: `Received ${parsedAmount} from ${sourceWallet} by Admin.`,
          date: new Date()
        });

        const newSourceBalance = sourceWallet === 'fund' ? await calculateFundBalance(targetUser._id) : await calculateUserBalance(targetUser._id);
        const newDestBalance = destWallet === 'fund' ? await calculateFundBalance(targetUser._id) : await calculateUserBalance(targetUser._id);
        
        await createAuditLog('TRANSFER', parsedAmount, sourceWallet, destWallet, oldSourceBalance, newSourceBalance, remark || `Transfer from ${sourceWallet} to ${destWallet}`);
      } else {
        return res.status(400).json({ error: "Invalid action type." });
      }

      // Notify User Real-time
      io.to(targetUser._id.toString()).emit('balance_update');
      
      res.json({ success: true, message: `Wallet management action '${actionType}' completed successfully.` });
    } catch (e) {
      console.error("Fund Management Error:", e);
      res.status(500).json({ error: "Server error: " + e.message + " | " + (e.stack ? e.stack.split('\n')[0] : '') });
    }
  });

  app.get('/api/admin/boosting-stats', authenticateToken, adminOnly, async (req, res) => {
    try {
      const users = await User.find({}, 'userId name email isBoostingBlocked').lean();
      
      const stats = [];
      for (const u of users) {
        let totalBoards = 0;
        let cycledBoards = 0;
        let boostingIncomeTx = [];

        if (mongoose.Types.ObjectId.isValid(u._id)) {
          totalBoards = await BoostingBoard.countDocuments({ ownerId: u._id });
          cycledBoards = await BoostingBoard.countDocuments({ ownerId: u._id, isCycled: true });
          boostingIncomeTx = await Transaction.find({ userId: u._id, category: 'BOOSTING_INCOME', status: 'Approved' });
        } else {
          totalBoards = await mongoose.connection.db.collection('boostingboards').countDocuments({ ownerId: u._id });
          cycledBoards = await mongoose.connection.db.collection('boostingboards').countDocuments({ ownerId: u._id, isCycled: true });
          boostingIncomeTx = await mongoose.connection.db.collection('transactions').find({ userId: u._id, category: 'BOOSTING_INCOME', status: 'Approved' }).toArray();
        }

        const totalIncome = boostingIncomeTx.reduce((sum, tx) => {
          if (tx.type === 'credit') return sum + (tx.amount || 0);
          if (tx.type === 'debit') return sum - (tx.amount || 0);
          return sum;
        }, 0);

        stats.push({
          dbId: u._id ? u._id.toString() : (u.id ? u.id.toString() : ''),
          userId: u.userId,
          name: u.name,
          email: u.email,
          isBlocked: u.isBoostingBlocked || false,
          totalBoards,
          cycledBoards,
          totalIncome
        });
      }
      
      res.json({ success: true, stats });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Server error fetching boosting stats." });
    }
  });

  app.post('/api/admin/toggle-boosting', authenticateToken, adminOnly, async (req, res) => {
    try {
      const { targetUserId } = req.body;
      let targetUser = mongoose.Types.ObjectId.isValid(targetUserId) ? await User.findById(targetUserId) : await User.findOne({ userId: targetUserId });
      if (!targetUser) return res.status(404).json({ error: "User not found." });

      targetUser.isBoostingBlocked = !targetUser.isBoostingBlocked;
      await targetUser.save();

      res.json({ success: true, isBlocked: targetUser.isBoostingBlocked, message: `Boosting income ${targetUser.isBoostingBlocked ? 'Blocked' : 'Unblocked'} for ${targetUser.userId}` });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Server error toggling boosting status." });
    }
  });

  // Admin: Adjust Boosting Income manually
  app.post('/api/admin/boost-adjust', authenticateToken, adminOnly, async (req, res) => {
    try {
      const { targetUserId, actionType, amount, remark } = req.body;
      let targetUser = mongoose.Types.ObjectId.isValid(targetUserId) ? await User.findById(targetUserId) : await User.findOne({ userId: targetUserId });
      if (!targetUser) return res.status(404).json({ error: "User not found." });

      const parsedAmount = parseFloat(amount);
      if (!['add', 'deduct'].includes(actionType) || isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: "Valid positive amount and action type required." });
      }

      const adminName = req.user.username || 'Admin';
      const txid = "BOOST-ADJ-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4).toUpperCase();
      const type = actionType === 'add' ? 'credit' : 'debit';

      await Transaction.create({
        txid,
        userId: targetUser._id,
        type,
        walletType: 'income',
        status: 'Approved',
        category: 'BOOSTING_INCOME',
        note: `Manual Adjustment by ${adminName}: ${remark || (actionType === 'add' ? 'Added' : 'Deducted')}`,
        amount: parsedAmount,
        date: new Date()
      });

      res.json({ success: true, message: `Successfully ${actionType === 'add' ? 'added' : 'deducted'} ${parsedAmount} COIN to ${targetUser.userId}'s Boosting Income.` });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Server error adjusting boosting income." });
    }
  });

  app.post('/api/admin/reward-status', authenticateToken, adminOnly, async (req, res) => {
    try {
      const { rewardId, status } = req.body;
      const reward = await RewardClaim.findById(rewardId);
      if (!reward) return res.status(404).json({ error: "Reward claim not found." });
      
      reward.status = status;
      
      if (status === 'Approved' && !reward.approvalDate) reward.approvalDate = new Date();
      if (status === 'Dispatched' && !reward.dispatchDate) reward.dispatchDate = new Date();
      if (status === 'Delivered' && !reward.deliveryDate) reward.deliveryDate = new Date();
      
      await reward.save();
      
      res.json({ success: true, message: `Reward status updated to ${status}.` });
    } catch (e) {
      console.error("Reward Update Error:", e);
      res.status(500).json({ error: "Server error updating reward status." });
    }
  });

  app.post('/api/admin/withdrawal-status', authenticateToken, adminOnly, async (req, res) => {
    try {
      const { withdrawId, status } = req.body;
      const w = await Withdrawal.findOne({ id: withdrawId });
      w.status = status;
      await w.save();

      if (status === 'Approved' || status === 'Completed') {
        // Only deduct from balance officially when approved or completed
        const existingTx = await Transaction.findOne({ txid: w.id });
        if (!existingTx) {
          await Transaction.create({
            txid: w.id,
            userId: w.userId,
            type: "debit",
            status: "Approved",
            walletType: "income",
            category: "Withdrawal",
            note: `${status} withdrawal to ${w.destination}`,
            amount: w.amount,
            date: new Date()
          });
        }
        io.to(w.userId.toString()).emit('balance_update');
      } else if (status === 'Rejected') {
        // Refund only if it was actually deducted initially
        const originalDebitTx = await Transaction.findOne({ txid: w.id, type: 'debit' });
        if (originalDebitTx) {
          const refundTx = await Transaction.findOne({ txid: w.id + '-REFUND' });
          if (!refundTx) {
            await Transaction.create({
              txid: w.id + '-REFUND',
              userId: w.userId,
              type: "credit",
              status: "Approved",
              walletType: "income",
              category: "Withdrawal Refund",
              note: `Refund for rejected withdrawal`,
              amount: w.amount,
              date: new Date()
            });
          }
        }
        io.to(w.userId.toString()).emit('balance_update');
      }
      res.json({ success: true, message: "Withdrawal updated." });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/ticket-reply', authenticateToken, adminOnly, async (req, res) => {
    try {
      const { ticketId, replyText, status } = req.body;
      const ticket = await Ticket.findOne({ id: ticketId });
      if (!ticket) return res.status(404).json({ error: "Ticket not found." });

      ticket.status = status;
      if (replyText && replyText.trim() !== '') {
        ticket.chat.push({ sender: 'Admin', text: replyText });
      }
      await ticket.save();

      await Notification.create({
        id: "not-" + Date.now(),
        userId: ticket.userId.toString(),
        message: `Admin replied to your ticket #${ticket.id}. Status: ${status}`,
        time: new Date()
      });

      io.to(ticket.userId.toString()).emit('ticket_reply');
      io.to(ticket.userId.toString()).emit('notification', { message: `Admin replied to your ticket #${ticket.id}. Status: ${status}` });

      res.json({ success: true, message: "Ticket reply sent." });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/broadcast-notification', authenticateToken, adminOnly, async (req, res) => {
    try {
      const { targetUserId, broadcastAll, message } = req.body;
      if (broadcastAll) {
        await Notification.create({ id: "not-" + Date.now(), userId: 'all', message });
        io.emit('notification', { message });
      } else {
        const u = await User.findOne({ userId: targetUserId.trim() });
        await Notification.create({ id: "not-" + Date.now(), userId: u._id.toString(), message });
        io.to(u._id.toString()).emit('notification', { message });
      }
      res.json({ success: true, message: "Broadcast sent." });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/admin/user-audit/:id', authenticateToken, adminOnly, async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      const activityLogs = await Log.find({ userId: user._id }).sort({ timestamp: -1 });
      const userTx = await Transaction.find({ userId: user._id }).sort({ date: -1 });
      const userWithdraws = await Withdrawal.find({ userId: user._id }).sort({ createdAt: -1 });
      const userTickets = await Ticket.find({ userId: user._id }).sort({ createdAt: -1 });
      res.json({ activityLogs, userTx, userWithdraws, userTickets });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ==========================================================================
  // DB MIGRATION: Fix walletType on existing transactions
  // This endpoint fixes historical data where walletType was missing.
  // Safe to run multiple times.
  // ==========================================================================
  app.post('/api/admin/migrate-wallet-types', authenticateToken, adminOnly, async (req, res) => {
    try {
      // Fix USDT Deposit credits → walletType: 'fund'
      const depositFix = await Transaction.updateMany(
        { category: 'USDT Deposit', type: 'credit', $or: [{ walletType: { $exists: false } }, { walletType: 'income' }] },
        { $set: { walletType: 'fund' } }
      );

      // Fix ID Activation debits → walletType: 'fund'
      const activationFix = await Transaction.updateMany(
        { category: 'ID Activation', type: 'debit', $or: [{ walletType: { $exists: false } }, { walletType: 'income' }] },
        { $set: { walletType: 'fund' } }
      );

      // Fix Internal Transfer Fund credits → walletType: 'fund'
      const itFundFix = await Transaction.updateMany(
        { category: 'Internal Transfer', type: 'credit', $or: [{ walletType: { $exists: false } }, { walletType: 'income' }] },
        { $set: { walletType: 'fund' } }
      );

      // Fix P2P Transfer credits (receiver) → walletType: 'fund'
      const p2pCreditFix = await Transaction.updateMany(
        { category: 'P2P Transfer', type: 'credit', $or: [{ walletType: { $exists: false } }] },
        { $set: { walletType: 'fund' } }
      );

      res.json({
        success: true,
        message: 'Migration complete.',
        fixed: {
          deposits: depositFix.modifiedCount,
          activations: activationFix.modifiedCount,
          internalTransfers: itFundFix.modifiedCount,
          p2pCredits: p2pCreditFix.modifiedCount
        }
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // WebSockets Channel Mapping
  io.on('connection', (socket) => {
    let userSessionId = null;
    socket.on('authenticate', (token) => {
      jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return;
        userSessionId = decoded.id;
        socket.join(userSessionId.toString());
        if (decoded.role === 'admin') socket.join('admin_room');
      });
    });
    socket.on('disconnect', () => {
      if (userSessionId) {
        socket.leave(userSessionId.toString());
        socket.leave('admin_room');
      }
    });
  });

  
  // ==========================================
  // GLOBAL BOOSTING POOL MODULE
  // ==========================================

  async function checkAndCycleBoard(boardId) {
    const board = await BoostingBoard.findOne({ boardId });
    if (!board || board.isCycled || board.members.length < 6) return;

    // Mark as cycled
    board.isCycled = true;
    board.cycleDate = new Date();
    await board.save();

    let owner = null;
    if (board.ownerId) {
      owner = await User.findOne({ _id: board.ownerId });
    }

    if (owner && !owner.isBoostingBlocked) {
      // Trigger Re-entry placement (structure only, no coins involved)
      await placeInBoostingMatrix(owner._id, owner.parentReferral, true);
    }

    // Generate 2 New System Positions to increase Boosting Speed
    await placeInBoostingMatrix(null, null, true, true);
    await placeInBoostingMatrix(null, null, true, true);
  }

  async function placeInBoostingMatrix(userId, sponsorRefCode, isReentry = false, isSystem = false) {
    // 1. Find the oldest pending board across the entire company
    let targetBoard = await BoostingBoard.findOne({ isCycled: false }).sort({ _id: 1 });

    let newBoard = null;
    
    // 2. Give the real user their own empty board first
    if (userId) {
      newBoard = await BoostingBoard.create({
        boardId: "BRD-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4).toUpperCase(),
        ownerId: userId,
        sponsorId: null, // Global queue doesn't use sponsors
        members: [],
        isCycled: false,
        isReentry: isReentry,
        createdAt: new Date(),
        payoutsReceived: []
      });
    }

    if (!targetBoard) {
      return newBoard || null;
    }

    // 3. Find first empty position in targetBoard (1 to 6)
    const occupied = targetBoard.members.map(m => m.position);
    let pos = 1;
    while (occupied.includes(pos) && pos <= 6) pos++;

    if (pos > 6) return newBoard; // Failsafe

    // 4. Place in targetBoard
    targetBoard.members.push({ userId: userId || null, position: pos, date: new Date() });
    await targetBoard.save();
    
    // Log target board placement for real users
    if (userId) {
      await Transaction.create({
        txid: "MAT-PLC-" + Date.now() + Math.random().toString(36).substr(2, 4).toUpperCase(),
        userId: userId, type: 'credit', walletType: 'income', status: 'Approved',
        category: isReentry ? 'MATRIX_REENTRY' : 'MATRIX_PLACEMENT',
        note: `Placed in Global Board ${targetBoard.boardId} at position ${pos}`,
        amount: 0, date: new Date()
      });
    }

    // 5. Check Cycle Completion
    await checkAndCycleBoard(targetBoard.boardId);

    return newBoard;
  }

  app.get('/api/user/boost/board', authenticateToken, async (req, res) => {
    try {
      const user = await User.findOne({ _id: req.user.id });
      
      let currentBoard = null;
      if (mongoose.Types.ObjectId.isValid(user._id)) {
        currentBoard = await BoostingBoard.findOne({ ownerId: user._id }).sort({ _id: -1 });
      } else {
        const boards = await mongoose.connection.db.collection('boostingboards').find({ ownerId: user._id }).sort({ _id: -1 }).limit(1).toArray();
        currentBoard = boards[0] || null;
      }
      
      if (!currentBoard) {
        if (user.status === 'Active' || user.idStatus === 'Activated') {
          await placeInBoostingMatrix(user._id, user.parentReferral, false);
          
          if (mongoose.Types.ObjectId.isValid(user._id)) {
            currentBoard = await BoostingBoard.findOne({ ownerId: user._id }).sort({ _id: -1 });
          } else {
            const newBoards = await mongoose.connection.db.collection('boostingboards').find({ ownerId: user._id }).sort({ _id: -1 }).limit(1).toArray();
            currentBoard = newBoards[0] || null;
          }
        } else {
          return res.json({ hasBoard: false });
        }
      }
      
      // Populate member names
      const members = [];
      for (let m of currentBoard.members) {
        if (!m.userId) {
          members.push({
            position: m.position,
            userId: 'SYSTEM',
            name: 'Auto Pool System',
            date: m.date
          });
        } else {
          const u = await User.findOne({ _id: m.userId });
          members.push({
            position: m.position,
            userId: u ? u.userId : 'Unknown',
            name: u ? u.name : 'Unknown',
            date: m.date
          });
        }
      }

      // Total cycles stat
      const totalCycles = mongoose.Types.ObjectId.isValid(user._id)
        ? await BoostingBoard.countDocuments({ ownerId: user._id, isCycled: true })
        : await mongoose.connection.db.collection('boostingboards').countDocuments({ ownerId: user._id, isCycled: true });
      let boostingIncomeTx = [];
      if (mongoose.Types.ObjectId.isValid(user._id)) {
        boostingIncomeTx = await Transaction.find({ userId: user._id, category: 'BOOSTING_INCOME', status: 'Approved' });
      } else {
        boostingIncomeTx = await mongoose.connection.db.collection('transactions').find({ userId: user._id, category: 'BOOSTING_INCOME', status: 'Approved' }).toArray();
      }
      const totalIncome = boostingIncomeTx.reduce((sum, tx) => {
        if (tx.type === 'credit') return sum + (tx.amount || 0);
        if (tx.type === 'debit') return sum - (tx.amount || 0);
        return sum;
      }, 0);
      
      // Calculate global pool size (approx 50 COIN per activated board including re-entries)
      const allBoardsCount = await BoostingBoard.countDocuments();
      const globalPool = allBoardsCount * 50;

      const globalPosition = await BoostingBoard.countDocuments({ _id: { $lte: currentBoard._id } });

      res.json({
        hasBoard: true,
        boardId: currentBoard.boardId,
        isCycled: currentBoard.isCycled,
        members: members,
        totalCycles,
        totalIncome,
        globalPool,
        globalPosition,
        history: boostingIncomeTx
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error fetching boosting board." });
    }
  });


  // ===================== AUTO BLASTER APIs =====================

  // GET: fetch user's auto blaster levels + auto-credit if due
  app.get('/api/user/auto-blaster', authenticateToken, async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found.' });

      // If not activated yet, return empty
      if (user.status !== 'Active') {
        return res.json({ levels: [], autoBlasterBalance: 0, totalTransferred: 0, activeDirects: 0 });
      }

      // Seed if not seeded (for users activated before this feature)
      const activationDate = user.activationApproval?.approvedDate || user.registrationDate || new Date();
      await seedAutoBlasterForUser(user._id, activationDate);

      const now = new Date();
      const activeDirects = await countActiveDirects(user._id);
      const records = await AutoBlasterReward.find({ userId: user._id }).sort({ level: 1 });

      for (const rec of records) {
        // Hotfix: Ensure level 6+ have 0 required directs and correct rewards for already seeded users
        let needsSave = false;
        if (rec.level >= 6 && rec.requiredDirects !== 0) {
          rec.requiredDirects = 0;
          needsSave = true;
        }
        
        // Hotfix: Fix incorrect reward amounts
        const correctRewards = {
          6: 2800, 7: 5600, 8: 11200, 9: 22400, 10: 44800,
          11: 89600, 12: 179200, 13: 358400, 14: 716800, 15: 1433600
        };
        if (correctRewards[rec.level] && rec.reward !== correctRewards[rec.level]) {
          rec.reward = correctRewards[rec.level];
          needsSave = true;
        }

        if (needsSave) await rec.save();

        if (rec.status === 'Transferred') continue;

        // Credit auto blaster wallet if scheduled date has passed
        if (rec.status === 'Pending' && now >= rec.scheduledCreditDate) {
          rec.creditedDate = now;
          rec.status = activeDirects >= rec.requiredDirects ? 'Unlocked' : 'Locked';
          await rec.save();
        }

        // Re-check lock/unlock status for already credited records
        if (rec.status === 'Locked') {
          if (activeDirects >= rec.requiredDirects) { rec.status = 'Unlocked'; await rec.save(); }
        }
      }

      // Compute auto blaster wallet balance (credited but not transferred)
      let autoBlasterBalance = 0;
      let totalTransferred = 0;
      for (const rec of records) {
        if (['Unlocked','Locked','Transferring'].includes(rec.status) && rec.creditedDate) {
          autoBlasterBalance += (rec.reward - rec.transferredAmount);
        }
        totalTransferred += rec.transferredAmount;
      }

      const levelsOut = records.map(rec => {
        const msLeft = Math.max(0, new Date(rec.scheduledCreditDate) - now);
        const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
        const dailyLimit = rec.dailyTransferPct > 0 ? Math.floor(rec.reward * rec.dailyTransferPct / 100) : rec.reward;

        // How much user can transfer today
        let todayTransferable = 0;
        if (rec.status === 'Unlocked' || rec.status === 'Transferring') {
          if (rec.dailyTransferPct > 0) {
            const istOffsetMs = 5.5 * 60 * 60 * 1000;
            const istTime = new Date(Date.now() + istOffsetMs);
            istTime.setUTCHours(0, 0, 0, 0);
            const today = new Date(istTime.getTime() - istOffsetMs);
            const alreadyToday = rec.transferHistory
              .filter(h => new Date(h.date) >= today)
              .reduce((s,h) => s + h.amount, 0);
            todayTransferable = Math.max(0, dailyLimit - alreadyToday);
          } else {
            todayTransferable = rec.reward - rec.transferredAmount;
          }
        }

        return {
          level:              rec.level,
          reward:             rec.reward,
          releaseDays:        rec.releaseDays,
          requiredDirects:    rec.requiredDirects,
          requiresPrevLevel:  rec.requiresPrevLevel,
          dailyTransferPct:   rec.dailyTransferPct,
          dailyLimit,
          scheduledCreditDate: rec.scheduledCreditDate,
          creditedDate:       rec.creditedDate,
          status:             rec.status,
          transferredAmount:  rec.transferredAmount,
          remaining:          rec.reward - rec.transferredAmount,
          todayTransferable,
          daysLeft:           rec.status === 'Pending' ? daysLeft : 0,
          transferHistory:    rec.transferHistory
        };
      });

      res.json({ levels: levelsOut, autoBlasterBalance, totalTransferred, activeDirects });
    } catch (e) {
      console.error('[AUTO BLASTER GET]', e);
      res.status(500).json({ error: e.message });
    }
  });

  // POST: transfer from auto blaster wallet to income wallet
  app.post('/api/user/auto-blaster/transfer', authenticateToken, async (req, res) => {
    try {
      const { level, amount } = req.body;
      if (!level || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid request.' });

      const user = await User.findById(req.user.id);
      const rec = await AutoBlasterReward.findOne({ userId: user._id, level: parseInt(level) });

      if (!rec) return res.status(404).json({ error: 'Auto Blaster level not found.' });
      if (!['Unlocked','Transferring'].includes(rec.status)) {
        return res.status(400).json({ error: `Level ${level} is not unlocked for transfer.` });
      }

      const remaining = rec.reward - rec.transferredAmount;
      if (amount > remaining) return res.status(400).json({ error: `Exceeds remaining balance of ${remaining} COIN.` });

      // Enforce daily limits for levels 6 to 15
      if (rec.dailyTransferPct > 0) {
        const dailyLimit = Math.floor(rec.reward * rec.dailyTransferPct / 100);
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const istTime = new Date(Date.now() + istOffsetMs);
        istTime.setUTCHours(0, 0, 0, 0);
        const today = new Date(istTime.getTime() - istOffsetMs);
        const alreadyToday = rec.transferHistory
          .filter(h => new Date(h.date) >= today)
          .reduce((s,h) => s + h.amount, 0);
        if (alreadyToday >= dailyLimit) {
          return res.status(400).json({ error: `Daily transfer limit of ${dailyLimit} COIN reached. Try again tomorrow.` });
        }
        if (amount + alreadyToday > dailyLimit) {
          return res.status(400).json({ error: `You can only transfer ${dailyLimit - alreadyToday} COIN more today.` });
        }
      }

      const txid = 'AB-' + Date.now() + '-' + Math.random().toString(36).substr(2,5).toUpperCase();
      const now = new Date();

      const requestedAmount = amount;
      const deductionAmount = requestedAmount * 0.15;
      const netAmount = requestedAmount - deductionAmount;

      // Credit income wallet
      await Transaction.create({
        txid,
        userId: user._id,
        type: 'credit',
        walletType: 'income',
        status: 'Approved',
        category: 'Auto Blaster',
        note: `Level ${level} Auto Blaster reward transfer (15% platform fee applied: -${deductionAmount} COIN)`,
        amount: netAmount,
        date: now
      });

      // Update record
      rec.transferredAmount += amount;
      rec.lastTransferDate = now;
      rec.transferHistory.push({ amount, date: now, txid });

      const newRemaining = rec.reward - rec.transferredAmount;
      if (newRemaining <= 0) {
        rec.status = 'Transferred';
      } else if (rec.level === 6) {
        rec.status = 'Transferring';
      }
      await rec.save();

      // Notify
      await Notification.create({
        id: 'not-ab-' + Date.now(),
        userId: user._id.toString(),
        message: `⚡ Auto Blaster Level ${level}: ${amount} COIN transferred to your Income Wallet!`,
        time: now
      });
      io.to(user._id.toString()).emit('balance_update');

      res.json({ success: true, message: `${amount} COIN transferred to Income Wallet from Auto Blaster Level ${level}.`, remaining: newRemaining });
    } catch (e) {
      console.error('[AUTO BLASTER TRANSFER]', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Catch-all: serve index.html for user portal routes only

  app.use((req, res) => {
    // Don't serve index.html for /admin sub-routes
    if (req.path.startsWith('/admin')) {
      return res.sendFile(path.join(__dirname, 'admin.html'));
    }
    res.sendFile(path.join(__dirname, 'index.html'));
  });
  // ============================================================
  // TIME-BASED BOOSTING ENGINE
  // ============================================================
  setInterval(async () => {
    try {
      // Find all main boards (not re-entry)
      const boards = await BoostingBoard.find({ isReentry: false });
      const now = Date.now();
      
      for (const board of boards) {
        const owner = await User.findById(board.ownerId);
        if (!owner || owner.isBoostingBlocked) continue;

        // Fallback to _id.getTimestamp() if createdAt is missing
        const creationTime = board.createdAt ? new Date(board.createdAt).getTime() : board._id.getTimestamp().getTime();
        const daysPassed = Math.floor((now - creationTime) / (1000 * 60 * 60 * 24));
        const milestones = [6, 13, 24, 45];
        let updated = false;

        for (const milestone of milestones) {
          if (daysPassed >= milestone && !board.payoutsReceived.includes(milestone)) {
            // Process Payout
            await Transaction.create({
              txid: "BST-TIME-" + milestone + "D-" + Date.now() + Math.random().toString(36).substr(2, 4).toUpperCase(),
              userId: owner._id,
              type: 'credit',
              walletType: 'income',
              status: 'Approved',
              category: 'BOOSTING_INCOME',
              note: `Global Boosting Income (Day ${milestone})`,
              amount: 50,
              date: new Date()
            });

            owner.balance += 50;
            board.payoutsReceived.push(milestone);
            updated = true;

            // Notify User via Socket
            io.to(owner._id.toString()).emit('notification', { message: `You received 50 COIN for Day ${milestone} Boosting Income!` });
          }
        }
        
        if (updated) {
          await owner.save();
          await board.save();
        }
      }
    } catch (e) {
      console.error("[BLU LEGACY] Error in Time-Based Boosting Engine:", e);
    }
  }, 60 * 60 * 1000); // Check every 1 hour

  if (!process.env.VERCEL) {
    server.listen(PORT, '0.0.0.0', async () => {
      console.log(`[BLU LEGACY] Platform Server listening actively on port ${PORT}`);

      // ========== AUTO MIGRATION ON STARTUP ==========
      try {
        // ... omitted simple migrations for brevity if needed, or just keep it simple
        const categoriesToFund = ['USDT Deposit', 'P2P Transfer', 'Internal Transfer'];
        let fixed = 0;
        const allTxs = dbData && dbData.transactions ? dbData.transactions : [];
        if (allTxs.length > 0) {
          // In-memory JSON fix
          allTxs.forEach((t, i) => {
            if (t.type === 'credit' && ['USDT Deposit', 'P2P Transfer'].includes(t.category) && t.walletType !== 'fund') {
              allTxs[i].walletType = 'fund';
              fixed++;
            }
            if (t.type === 'debit' && t.category === 'ID Activation' && t.walletType !== 'fund') {
              allTxs[i].walletType = 'fund';
              fixed++;
            }
            if (t.type === 'credit' && t.category === 'Internal Transfer' && t.walletType !== 'fund') {
              allTxs[i].walletType = 'fund';
              fixed++;
            }
            if (t.type === 'credit' && ['Direct Income', 'Level Income'].includes(t.category) && t.walletType !== 'income') {
              allTxs[i].walletType = 'income';
              fixed++;
            }
          });
          if (fixed > 0) {
            saveLocalDb();
            console.log(`[MIGRATION] Fixed ${fixed} transaction wallet types in JSON store.`);
          } else {
            console.log(`[MIGRATION] All wallet types OK — no fixes needed.`);
          }
        } else {
          // MongoDB mode
          try {
            const d1 = await Transaction.updateMany(
              { category: 'USDT Deposit', type: 'credit', walletType: { $ne: 'fund' } },
              { $set: { walletType: 'fund' } }
            );
            const d2 = await Transaction.updateMany(
              { category: 'P2P Transfer', type: 'credit', walletType: { $ne: 'fund' } },
              { $set: { walletType: 'fund' } }
            );
            const d3 = await Transaction.updateMany(
              { category: 'ID Activation', type: 'debit', walletType: { $ne: 'fund' } },
              { $set: { walletType: 'fund' } }
            );
            const d4 = await Transaction.updateMany(
              { category: 'Internal Transfer', type: 'credit', walletType: { $ne: 'fund' } },
              { $set: { walletType: 'fund' } }
            );
            const total = d1.modifiedCount + d2.modifiedCount + d3.modifiedCount + d4.modifiedCount;
            if (total > 0) {
              console.log(`[MIGRATION] Fixed ${total} wallet types in MongoDB.`);
            } else {
              console.log(`[MIGRATION] All wallet types OK — no fixes needed.`);
            }
          } catch (mongoErr) {
            console.warn('[MIGRATION] MongoDB updateMany skipped:', mongoErr.message);
          }
        }

        // Auto Blaster release days migration
        try {
          const allRewards = await AutoBlasterReward.find();
          const newReleaseMap = {
            1: 2, 2: 6, 3: 13, 4: 20, 5: 30, 6: 60, 7: 100, 8: 145,
            9: 190, 10: 240, 11: 300, 12: 360, 13: 420, 14: 500, 15: 600
          };
          const newDirectsMap = {
            1: 0, 2: 1, 3: 3, 4: 7, 5: 15
          };
          let abFixed = 0;
          for (const reward of allRewards) {
            let changed = false;
            const expRelease = newReleaseMap[reward.level];
            const expDirects = newDirectsMap[reward.level];

            if (expRelease && reward.releaseDays !== expRelease) {
              reward.releaseDays = expRelease;
              const scheduled = new Date(reward.activationDate);
              scheduled.setDate(scheduled.getDate() + expRelease);
              reward.scheduledCreditDate = scheduled;
              changed = true;
            }
            if (expDirects !== undefined && reward.requiredDirects !== expDirects) {
              reward.requiredDirects = expDirects;
              changed = true;
            }
            if (changed) {
              await reward.save();
              abFixed++;
            }
          }
          if (abFixed > 0) console.log(`[MIGRATION] Updated ${abFixed} Auto Blaster schedules/directs.`);
        } catch(e) {
          console.warn('[MIGRATION] Auto Blaster skipped:', e.message);
        }

      } catch (migErr) {
        console.error('[MIGRATION ERROR]', migErr.message);
      }
    });
  }
}

const bootstrapPromise = bootstrap();

if (process.env.VERCEL) {
  // Export app and promise for Serverless execution
  module.exports = { app, bootstrapPromise };
} else {
  // Local environment execution
  bootstrapPromise.then(() => {
    // We already called server.listen inside bootstrap, so nothing to do here.
  });
}
