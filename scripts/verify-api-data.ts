import {
  getTransactions,
  getClassifications,
  getDecisions,
  getGuardrailChecks,
  getExecutions,
  getAuditLogs,
  getLedgerEntries,
} from '../src/lib/db';
import { getAllNormalizedTransactions } from '../src/lib/normalizers';

async function main() {
  console.log('--- STARTING END-TO-END DATA & PIPELINE VERIFICATION ---');

  const [
    txs,
    classifications,
    decisions,
    guardrailChecks,
    executions,
    auditLogs,
    ledgerEntries,
    normalized,
  ] = await Promise.all([
    getTransactions(),
    getClassifications(),
    getDecisions(),
    getGuardrailChecks(),
    getExecutions(),
    getAuditLogs(),
    getLedgerEntries(),
    getAllNormalizedTransactions(),
  ]);

  let pass = true;

  console.log(`\n1. Raw Transactions Count: ${txs.length} (Expected: 300)`);
  if (txs.length !== 300) {
    console.error('❌ FAIL: Raw transactions count is not 300.');
    pass = false;
  } else {
    console.log('✅ PASS: Exactly 300 raw transactions exist.');
  }

  console.log(`\n2. Pipeline Completeness:`);
  console.log(`- Classifications: ${classifications.length}`);
  console.log(`- Decisions: ${decisions.length}`);
  console.log(`- Guardrail Checks: ${guardrailChecks.length}`);
  console.log(`- Executions: ${executions.length}`);
  console.log(`- Audit Logs: ${auditLogs.length}`);

  if (
    classifications.length !== 300 ||
    decisions.length !== 300 ||
    guardrailChecks.length !== 300 ||
    executions.length !== 300 ||
    auditLogs.length < 300
  ) {
    console.error('❌ FAIL: Incomplete pipeline traces found.');
    pass = false;
  } else {
    console.log('✅ PASS: All 300 records have full 4-stage pipeline traces.');
  }

  console.log(`\n3. Ledger Financial Integrity:`);
  const ledgerTxIds = ledgerEntries.map(l => l.transaction_id);
  const uniqueLedgerTxIds = new Set(ledgerTxIds);
  const sumLedgerAmount = ledgerEntries.reduce((s, l) => s + l.amount, 0);

  console.log(`- Ledger entries count: ${ledgerEntries.length}`);
  console.log(`- Unique recovered tx IDs: ${uniqueLedgerTxIds.size}`);
  console.log(`- Sum of ledger entries: ₹${sumLedgerAmount.toLocaleString('en-IN')}`);

  if (ledgerEntries.length !== uniqueLedgerTxIds.size) {
    console.error('❌ FAIL: Ledger contains duplicate transaction IDs.');
    pass = false;
  } else {
    console.log('✅ PASS: No duplicate transaction IDs in ledger.');
  }

  console.log(`\n4. Normalizer API View Contract:`);
  console.log(`- Normalized TransactionView records count: ${normalized.length}`);
  if (normalized.length !== 300) {
    console.error('❌ FAIL: Normalizer did not return 300 records.');
    pass = false;
  } else {
    console.log('✅ PASS: Normalizer returned 300 TransactionView objects.');
  }

  console.log('\n--- FINAL VERIFICATION REPORT ---');
  if (pass) {
    console.log('🎉 ALL SYSTEM DATA AND API VERIFICATIONS PASSED CLEANLY! ✅');
    process.exit(0);
  } else {
    console.error('💥 SYSTEM DATA VERIFICATION FAILED! ❌');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unhandled error in verification:', err);
  process.exit(1);
});
