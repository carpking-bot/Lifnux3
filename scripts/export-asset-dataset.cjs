const fs = require('fs');
const path = require('path');
const root = process.cwd();
const datasetPath = path.join(root, 'app', '(apps)', 'finance', 'asset', 'asset_dataset.json');
const d = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
const accounts = d.accounts;
const snapshots = d.snapshots;

const header = ['month', 'createdAt', ...accounts.map((a) => a.id), 'total'];
const rows = [header.join(',')];

for (const s of snapshots) {
  const map = new Map(s.lines.map((l) => [l.accountId, l.valueKRW]));
  const vals = accounts.map((a) => map.get(a.id) ?? 0);
  const total = vals.reduce((x, y) => x + y, 0);
  rows.push([s.month, s.createdAt, ...vals, total].join(','));
}

const csvPath = path.join(root, 'app', '(apps)', 'finance', 'asset', 'asset_dataset_export.csv');
fs.writeFileSync(csvPath, rows.join('\n'), 'utf8');

const summary = [];
summary.push('Asset Dataset Export');
summary.push('accounts=' + accounts.length + ', snapshots=' + snapshots.length);
summary.push('Accounts:');
for (const a of accounts) {
  const memo = a.memo ? ' | memo:' + a.memo : '';
  summary.push('- ' + a.id + ' | ' + a.name + ' | ' + a.group + ' | ' + a.subGroup + memo);
}
summary.push('');
summary.push('Monthly totals:');
for (const s of snapshots) {
  const t = s.lines.reduce((sum, l) => sum + l.valueKRW, 0);
  summary.push('- ' + s.month + ' | total=' + t);
}
if (d.validation) {
  summary.push('');
  summary.push('Validation: ' + d.validation.totalAgainstSheet + ' (mismatch=' + d.validation.mismatchCount + ')');
  for (const m of d.validation.mismatches || []) {
    summary.push('- ' + m.month + ': expected=' + m.expected + ', actual=' + m.actual + ', diff=' + m.diff);
  }
}

const txtPath = path.join(root, 'app', '(apps)', 'finance', 'asset', 'asset_dataset_export.txt');
fs.writeFileSync(txtPath, summary.join('\n'), 'utf8');
console.log(csvPath);
console.log(txtPath);
