import { getLedgerReconciliation } from '../src/lib/ledger';

async function main() {
  console.log('Starting Ledger Verification...');
  
  const res = await getLedgerReconciliation();
  
  console.log(`- Ledger rows: ${res.ledgerRows}`);
  console.log(`- Unique transaction IDs: ${res.uniqueTransactionIds}`);
  
  if (res.duplicateTransactionIds.length > 0) {
    console.error(`- Duplicate transaction IDs found:`, res.duplicateTransactionIds);
  } else {
    console.log('- No duplicate transaction IDs found.');
  }

  console.log(`- Ledger recovered total: ₹${res.recoveredTotal.toLocaleString('en-IN')}`);
  
  if (res.isBalanced) {
    console.log('✅ Ledger is balanced and accurately reflects all recovered executions.');
    process.exit(0);
  } else {
    console.error('❌ Ledger verification failed! The ledger is out of balance or contains duplicates.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
