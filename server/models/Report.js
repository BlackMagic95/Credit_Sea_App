const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
  type: String,
  bank: String,
  address: String,
  accountNumber: String,
  amountOverdue: Number,
  currentBalance: Number,
  holderPan: String
});

const ReportSchema = new mongoose.Schema(
  {
    name: String,
    phone: String,
    pan: String,
    creditScore: Number,
    totalAccounts: Number,
    activeAccounts: Number,
    closedAccounts: Number,
    currentBalance: Number,
    securedBalance: Number,
    unsecuredBalance: Number,
    recentEnquiries: Number,
    accounts: [AccountSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Report', ReportSchema);
