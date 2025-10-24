// server/index.js
const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const xml2js = require('xml2js');
const cors = require('cors');
require('dotenv').config();

const Report = require('./models/Report');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/creditsea', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

/* Utilities */
function normalizeKey(k) { return String(k || '').toLowerCase().replace(/[\s_\-]/g, ''); }
function pickFirstPrimitive(node, key) {
  if (!node) return undefined;
  const v = node[key] ?? node[key.toString()];
  if (v === undefined) return undefined;
  if (Array.isArray(v)) {
    for (const item of v) {
      if (item === null || item === undefined) continue;
      if (typeof item === 'object' && item._ !== undefined) return String(item._).trim();
      if (typeof item !== 'object') return String(item).trim();
    }
    return undefined;
  } else if (typeof v === 'object') {
    if (v._ !== undefined) return String(v._).trim();
    return undefined;
  } else {
    return String(v).trim();
  }
}
function collectNodes(obj, out = []) {
  if (!obj || typeof obj !== 'object') return out;
  out.push(obj);
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (Array.isArray(v)) {
      for (const item of v) collectNodes(item, out);
    } else if (typeof v === 'object') {
      collectNodes(v, out);
    }
  }
  return out;
}
function findFirstByTag(parsed, candidates = []) {
  if (!parsed) return undefined;
  const nodes = collectNodes(parsed);
  const normCandidates = candidates.map(normalizeKey);
  for (const node of nodes) {
    for (const k of Object.keys(node)) {
      if (normCandidates.includes(normalizeKey(k))) {
        const val = pickFirstPrimitive(node, k);
        if (val !== undefined) return val;
      }
    }
  }
  return undefined;
}
function sumNumericValue(v) {
  if (v === undefined || v === null || v === '') return 0;
  if (Array.isArray(v)) return v.reduce((s, item) => s + sumNumericValue(item), 0);
  if (typeof v === 'object') {
    if (v._ !== undefined) return sumNumericValue(v._);
    return 0;
  }
  const s = String(v).replace(/[^0-9.\-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function findAccountNodes(parsed) {
  if (!parsed) return [];
  const nodes = collectNodes(parsed);
  const accs = [];
  for (const node of nodes) {
    const keys = Object.keys(node).map(normalizeKey);
    const match = keys.some(k => (
      k.includes('accountnumber') ||
      k === 'account_number' ||
      k.includes('currentbalance') ||
      k.includes('amountpastdue') ||
      k.includes('amount_past_due') ||
      k.includes('subscribername') ||
      k.includes('cais_account_details') ||
      k.includes('account_type')
    ));
    if (match) accs.push(node);
  }
  return Array.from(new Set(accs));
}
function pickFromNode(node, candidates = []) {
  for (const c of candidates) {
    for (const k of Object.keys(node)) {
      if (normalizeKey(k) === normalizeKey(c)) {
        const v = pickFirstPrimitive(node, k);
        if (v !== undefined) return v;
      }
    }
  }
  return undefined;
}
function titleCaseName(s) {
  if (!s) return s;
  return s.split(/\s+/).map(part => {
    if (!part) return '';
    return part[0].toUpperCase() + part.slice(1).toLowerCase();
  }).join(' ');
}
function cleanBankString(s) {
  if (!s) return '';
  return s.replace(/^\s*[\d\-\.\:]+\s*[-:]*\s*/,'').trim();
}
function normalizePhoneDigits(s) {
  if (!s) return '';
  const digits = String(s).replace(/\D/g,'');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}
function isLikelyAccount(node, bank, accNum, desc) {
  const badWords = ['bureau', 'disclosure', 'report', 'match', 'summary'];
  const combined = ((bank || '') + ' ' + (accNum || '') + ' ' + (desc || '')).toLowerCase();
  for (const w of badWords) if (combined.includes(w)) return false;
  const hasMeaningful = Boolean(bank || accNum || findFirstByTag(node, ['Current_Balance','CurrentBalance','OutstandingBalance']) || findFirstByTag(node, ['Amount_Past_Due','AmountPastDue']));
  return hasMeaningful;
}
function findFirstPANInXml(xmlStr) {
  if (!xmlStr) return null;
  const m = xmlStr.match(/([A-Za-z]{5}\d{4}[A-Za-z])/);
  return m ? m[1].toUpperCase() : null;
}
function findFirstPhoneInXml(xmlStr) {
  if (!xmlStr) return null;
  const digits = xmlStr.replace(/[^0-9]/g, ' ');
  const seqs = digits.split(/\s+/).filter(Boolean);
  for (const s of seqs) {
    if (s.length === 10 && /^[6-9]\d{9}$/.test(s)) return s;
    if (s.length === 12 && s.startsWith('91') && /^[6-9]\d{9}$/.test(s.slice(2))) return s.slice(2);
    if (s.length === 11 && s.startsWith('0') && /^[6-9]\d{9}$/.test(s.slice(1))) return s.slice(1);
  }
  return null;
}

/* Routes */

// Health
app.get('/', (req, res) => res.json({ status: 'ok' }));

// Upload and parse XML
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const xmlRaw = req.file.buffer.toString('utf8');

    let parsed;
    try {
      parsed = await xml2js.parseStringPromise(xmlRaw, { explicitArray: true, trim: true, explicitCharkey: false, mergeAttrs: true });
    } catch (err) {
      console.error('XML parse error:', err);
      return res.status(422).json({ error: 'Invalid XML', details: err.message });
    }

    // Name
    const firstName = findFirstByTag(parsed, ['First_Name','FirstName','GivenName']) || '';
    const lastName = findFirstByTag(parsed, ['Last_Name','LastName','Surname']) || '';
    let name = '';
    if (firstName || lastName) name = `${firstName || ''} ${lastName || ''}`.trim();
    if (!name) name = findFirstByTag(parsed, ['Name','FullName','CustomerName']) || '';
    name = titleCaseName(name);

    // Phone
    const phoneCandidates = ['MobilePhoneNumber','Mobile','Telephone_Number_Applicant_1st','Phone','Telephone','ApplicantPhone'];
    let phone = findFirstByTag(parsed, phoneCandidates) || '';
    phone = normalizePhoneDigits(phone);
    if (!phone) {
      const phoneFromXml = findFirstPhoneInXml(xmlRaw);
      if (phoneFromXml) phone = phoneFromXml;
    }

    // PAN
    let pan = findFirstByTag(parsed, ['Income_TAX_PAN','PAN','TaxId','IncomeTaxPAN']) || '';
    if (!pan) {
      const panFromXml = findFirstPANInXml(xmlRaw);
      if (panFromXml) pan = panFromXml;
    }

    // Credit score
    const creditScore = sumNumericValue(findFirstByTag(parsed, ['BureauScore','Bureau_Score','CreditScore','Score','OverallScore'])) || 0;

    // Summary numbers
    const totalAccounts = sumNumericValue(findFirstByTag(parsed, ['CreditAccountTotal','TotalAccounts','Credit_Account_Total'])) || 0;
    const activeAccounts = sumNumericValue(findFirstByTag(parsed, ['CreditAccountActive','ActiveAccounts'])) || 0;
    const closedAccounts = sumNumericValue(findFirstByTag(parsed, ['CreditAccountClosed','ClosedAccounts'])) || 0;

    const currentBalance = sumNumericValue(findFirstByTag(parsed, ['Outstanding_Balance_All','OutstandingBalanceAll','TotalOutstandingBalance','CurrentBalance'])) || 0;
    const securedBalance = sumNumericValue(findFirstByTag(parsed, ['Outstanding_Balance_Secured','SecuredAmount','OutstandingBalanceSecured'])) || 0;
    const unsecuredBalance = sumNumericValue(findFirstByTag(parsed, ['Outstanding_Balance_UnSecured','UnsecuredAmount','OutstandingBalanceUnsecured'])) || 0;

    const recentEnquiries = sumNumericValue(findFirstByTag(parsed, ['TotalCAPSLast7Days','CAPSLast7Days','TotalCAPSLast7Days'])) || 0;

    // Accounts
    const rawAccountNodes = findAccountNodes(parsed);
    const accounts = [];
    for (const node of rawAccountNodes) {
      const bankRaw = pickFromNode(node, ['Subscriber_Name','SubscriberName','Bank','Lender','Subscriber']) || '';
      const bank = cleanBankString(bankRaw);
      const accountNumber = pickFromNode(node, ['Account_Number','AccountNumber','AccountNo','AccountNoMasked']) || '';
      const accountType = pickFromNode(node, ['Account_Type','AccountType','ProductType']) || '';
      const portfolioType = pickFromNode(node, ['Portfolio_Type','PortfolioType']) || '';
      const amountOverdue = sumNumericValue(pickFromNode(node, ['Amount_Past_Due','AmountPastDue','AmountPastDueTotal'])) || 0;
      const currentBal = sumNumericValue(pickFromNode(node, ['Current_Balance','CurrentBalance','OutstandingBalance'])) || 0;

      // Address extraction
      let address = '';
      const a1 = pickFromNode(node, ['First_Line_Of_Address_non_normalized','FirstLineOfAddress','Address1']) || '';
      const a2 = pickFromNode(node, ['Second_Line_Of_Address_non_normalized','Address2','SecondLineOfAddress']) || '';
      const city = pickFromNode(node, ['City_non_normalized','City']) || '';
      const zip = pickFromNode(node, ['ZIP_Postal_Code_non_normalized','ZIP','PostalCode','Pincode']) || '';
      const adrParts = [a1, a2, city, zip].filter(Boolean);
      if (adrParts.length) address = adrParts.join(', ');

      if (!address && node.CAIS_Holder_Address_Details) {
        const cad = Array.isArray(node.CAIS_Holder_Address_Details) ? node.CAIS_Holder_Address_Details[0] : node.CAIS_Holder_Address_Details;
        if (cad) {
          const p1 = cad.First_Line_Of_Address_non_normalized ? (Array.isArray(cad.First_Line_Of_Address_non_normalized) ? cad.First_Line_Of_Address_non_normalized[0] : cad.First_Line_Of_Address_non_normalized) : '';
          const p2 = cad.Second_Line_Of_Address_non_normalized ? (Array.isArray(cad.Second_Line_Of_Address_non_normalized) ? cad.Second_Line_Of_Address_non_normalized[0] : cad.Second_Line_Of_Address_non_normalized) : '';
          const pc = cad.City_non_normalized ? (Array.isArray(cad.City_non_normalized) ? cad.City_non_normalized[0] : cad.City_non_normalized) : '';
          const pz = cad.ZIP_Postal_Code_non_normalized ? (Array.isArray(cad.ZIP_Postal_Code_non_normalized) ? cad.ZIP_Postal_Code_non_normalized[0] : cad.ZIP_Postal_Code_non_normalized) : '';
          const arr = [p1,p2,pc,pz].filter(Boolean);
          if (arr.length) address = arr.join(', ');
        }
      }

      const holderPan = pickFromNode(node, ['Income_TAX_PAN','PAN']) || '';
      const desc = pickFromNode(node, ['Description','Detail','Remarks']) || '';

      if (!isLikelyAccount(node, bank, accountNumber, desc)) continue;

      accounts.push({
        type: accountType || portfolioType || '',
        bank,
        address,
        accountNumber,
        amountOverdue,
        currentBalance: currentBal,
        holderPan
      });
    }

    // dedupe
    const uniq = [];
    const seen = new Set();
    for (const a of accounts) {
      const key = (a.accountNumber || '').trim() || JSON.stringify(a);
      if (!seen.has(key)) {
        uniq.push(a);
        seen.add(key);
      }
    }

    const totalAccountsFinal = (sumNumericValue(findFirstByTag(parsed, ['CreditAccountTotal','TotalAccounts','Credit_Account_Total'])) || uniq.length || 0);

    const reportData = {
      name: name || '',
      phone: phone || '',
      pan: pan || '',
      creditScore: creditScore || 0,
      totalAccounts: totalAccountsFinal,
      activeAccounts: activeAccounts || 0,
      closedAccounts: closedAccounts || 0,
      currentBalance: currentBalance || 0,
      securedBalance: securedBalance || 0,
      unsecuredBalance: unsecuredBalance || 0,
      recentEnquiries: recentEnquiries || 0,
      accounts: uniq
    };

    if (!reportData.name) console.warn('DEBUG: name not found in XML');
    if (!reportData.pan) console.warn('DEBUG: pan not found in XML');
    if (!reportData.phone) console.warn('DEBUG: phone not found in XML');
    if (reportData.accounts.length === 0) console.warn('DEBUG: no accounts detected');

    const created = await Report.create(reportData);
    return res.status(201).json(created);

  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /reports
app.get('/reports', async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 });
    res.json(reports);
  } catch (err) {
    console.error('Failed to fetch reports:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /reports/:id -> delete single report
app.delete('/reports/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const deleted = await Report.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: 'Report not found' });
    return res.json({ success: true, id });
  } catch (err) {
    console.error('Delete error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /reports -> delete all reports
app.delete('/reports', async (req, res) => {
  try {
    await Report.deleteMany({});
    return res.json({ success: true, deletedAll: true });
  } catch (err) {
    console.error('Delete all error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
