import { getTransactions, getLedgerEntries, getLedgerSummary } from '../src/lib/db';
import {
  calculateTotalAtRisk,
  calculateRecoveredRevenue,
  calculateRecoveryRate,
  calculateLedgerReconciliation,
} from '../src/lib/metrics';
import { getAllNormalizedTransactions } from '../src/lib/normalizers';

async function main() {
  console.log('--- VERIFYING DASHBOARD DATA & METRICS ---');

  const txs = await getTransactions();
  console.log(`Total transactions in DB: ${txs.length}`);
  if (txs.length === 0) {
    console.error('FAIL: No transactions found. Run scripts/generate-data.ts first.');
    process.exit(1);
  }

  const ledger = await getLedgerEntries();
  console.log(`Total ledger entries in DB: ${ledger.length}`);

  const totalAtRisk = calculateTotalAtRisk(txs);
  const sumTxAmount = txs.reduce((sum, t) => sum + t.amount, 0);
  console.log(`Calculated Total At Risk: ₹${totalAtRisk.toLocaleString('en-IN')}`);
  if (totalAtRisk !== sumTxAmount) {
    console.error(`FAIL: calculateTotalAtRisk (${totalAtRisk}) !== sum(txs) (${sumTxAmount})`);
    process.exit(1);
  }

  const totalRecovered = calculateRecoveredRevenue(ledger);
  const recoveryRate = calculateRecoveryRate(totalRecovered, totalAtRisk);
  console.log(`Calculated Total Recovered: ₹${totalRecovered.toLocaleString('en-IN')}`);
  console.log(`Calculated Recovery Rate: ${recoveryRate.toFixed(2)}%`);

  const recon = calculateLedgerReconciliation(ledger, txs);
  console.log(`Ledger balanced: ${recon.ledgerBalanced}`);
  console.log(`Duplicate transaction IDs in ledger: ${recon.duplicateTransactionIds.length}`);

  if (!recon.ledgerBalanced) {
    console.warn(`WARNING: Ledger has duplicate transaction IDs: ${recon.duplicateTransactionIds.join(', ')}`);
  }

  const normalized = await getAllNormalizedTransactions();
  console.log(`Normalized transactions view count: ${normalized.length}`);
  if (normalized.length !== txs.length) {
    console.error(`FAIL: Normalized views count (${normalized.length}) !== transactions count (${txs.length})`);
    process.exit(1);
  }

  console.log('\nDASHBOARD DATA VERIFICATION: PASS');
}

main().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
