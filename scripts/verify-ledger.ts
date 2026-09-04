import { getLedgerReconciliation } from '../src/lib/ledger';

async function main() {
  console.log('=== VERIFYING RECOVERY LEDGER INTEGRITY ===');

  const recon = await getLedgerReconciliation();

  console.log(`- Ledger Rows Count: ${recon.totalRows}`);
  console.log(`- Unique Transaction IDs: ${recon.uniqueTransactionCount}`);
  console.log(`- Duplicate Transaction IDs: ${recon.duplicateTransactionIds.length}`);
  console.log(`- Duplicate Idempotency Keys: ${recon.duplicateIdempotencyKeys.length}`);
  console.log(`- Total Recovered Revenue: ₹${recon.totalRecovered.toLocaleString('en-IN')}`);
  console.log(`- Ledger Balanced Status: ${recon.isBalanced ? 'BALANCED ✓' : 'UNBALANCED ❌'}`);

  if (recon.duplicateTransactionIds.length > 0) {
    console.error(`FAIL: Found duplicate transaction IDs in ledger:`, recon.duplicateTransactionIds);
    process.exit(1);
  }

  if (recon.duplicateIdempotencyKeys.length > 0) {
    console.error(`FAIL: Found duplicate idempotency keys in ledger:`, recon.duplicateIdempotencyKeys);
    process.exit(1);
  }

  if (!recon.isBalanced) {
    console.error('FAIL: Ledger is not balanced!');
    process.exit(1);
  }

  console.log('\nLEDGER INTEGRITY VERIFICATION: PASS');
}

main().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});
