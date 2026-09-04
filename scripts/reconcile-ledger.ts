import fs from 'fs';
import path from 'path';
import { readDatabase, writeDatabase, getJsonDbPath } from '../src/lib/db';
import { getLedgerReconciliation } from '../src/lib/ledger';

async function main() {
  console.log('=== MANDATE RESCUE LEDGER RECONCILIATION ===');

  const dbPath = getJsonDbPath();
  if (!fs.existsSync(dbPath)) {
    console.error(`Database file not found at ${dbPath}`);
    process.exit(1);
  }

  // 1. Create a timestamped backup before modifying any data
  const backupDir = path.join(path.dirname(dbPath), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `db-before-ledger-reconcile-${timestampStr}.json`);

  const rawData = fs.readFileSync(dbPath, 'utf8');
  fs.writeFileSync(backupPath, rawData, 'utf8');
  console.log(`Backup created successfully at: ${backupPath}`);

  // 2. Read database records
  const db = JSON.parse(rawData);
  const ledger = db.ledger || [];
  const initialRowsCount = ledger.length;

  const initialUniqueTxIds = new Set(ledger.map((e: any) => e.transaction_id)).size;
  const initialTotalRecovered = ledger.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

  console.log(`\nBefore Reconciliation:`);
  console.log(`- Ledger rows count: ${initialRowsCount}`);
  console.log(`- Unique recovered transaction IDs: ${initialUniqueTxIds}`);
  console.log(`- Recovered total: ₹${initialTotalRecovered.toLocaleString('en-IN')}`);

  // 3. Filter duplicate ledger entries: keep earliest valid entry for each transaction_id / idempotency_key
  const seenTxIds = new Set<string>();
  const seenKeys = new Set<string>();
  const retainedLedger: any[] = [];
  const removedEntries: any[] = [];

  for (const entry of ledger) {
    const txId = entry.transaction_id;
    const key = entry.idempotency_key || `recovery:${txId}`;

    if (seenTxIds.has(txId) || seenKeys.has(key)) {
      removedEntries.push(entry);
    } else {
      seenTxIds.add(txId);
      seenKeys.add(key);
      retainedLedger.push({
        ...entry,
        idempotency_key: key,
      });
    }
  }

  const duplicateRowsRemoved = removedEntries.length;
  const finalRowsCount = retainedLedger.length;
  const finalTotalRecovered = retainedLedger.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

  // 4. Update db object
  db.ledger = retainedLedger;

  // Add audit logs for removed duplicates
  if (!db.audit_log) db.audit_log = [];
  for (const dup of removedEntries) {
    db.audit_log.push({
      id: `audit_recon_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      transaction_id: dup.transaction_id,
      stage: 'execute',
      event_type: 'ledger_duplicate_reconciled',
      detail: `Duplicate ledger entry ${dup.id || ''} removed during reconciliation for transaction ${dup.transaction_id}.`,
      created_at: new Date().toISOString(),
      timestamp: new Date().toISOString(),
    });
  }

  // Write updated DB
  writeDatabase(db);

  // 5. Verify reconciliation
  const recon = await getLedgerReconciliation();

  console.log(`\nAfter Reconciliation:`);
  console.log(`- Duplicate rows removed: ${duplicateRowsRemoved}`);
  console.log(`- Ledger rows remaining: ${finalRowsCount}`);
  console.log(`- Final recovered total: ₹${finalTotalRecovered.toLocaleString('en-IN')}`);
  console.log(`- Reconciliation Status: ${recon.isBalanced ? 'BALANCED ✓' : 'UNBALANCED ❌'}`);

  if (!recon.isBalanced) {
    console.error('ERROR: Ledger reconciliation failed after cleanup!');
    process.exit(1);
  }

  console.log('\nLEDGER RECONCILIATION: PASS');
}

main().catch(err => {
  console.error('Reconciliation error:', err);
  process.exit(1);
});
