import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'db.json');

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('db.json not found!');
    process.exit(1);
  }

  // 1. Create backup
  const backupPath = `${DB_PATH}.backup-${Date.now()}`;
  fs.copyFileSync(DB_PATH, backupPath);
  console.log(`Created backup at: ${backupPath}`);

  const rawData = fs.readFileSync(DB_PATH, 'utf8');
  const db = JSON.parse(rawData);

  if (!db.ledger) {
    console.log('No ledger entries found.');
    process.exit(0);
  }

  const beforeCount = db.ledger.length;
  const beforeTotal = db.ledger.reduce((s: number, e: any) => s + Number(e.amount), 0);

  // 2 & 3. Deduplicate and filter by successful execution
  const executionsByTxId = new Map<string, any>(
    db.executions?.map((e: any) => [e.transaction_id, e]) || []
  );

  // Sort ledger by timestamp ASC to keep the earliest entry
  const sortedLedger = [...db.ledger].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const retainedLedger: any[] = [];
  const seenTxIds = new Set<string>();

  for (const entry of sortedLedger) {
    const txId = entry.transaction_id;
    if (seenTxIds.has(txId)) {
      continue; // Skip duplicate
    }
    
    // Check if there's a valid successful recovery for this txId
    const execution = executionsByTxId.get(txId);
    if (execution && execution.outcome === 'recovered') {
      retainedLedger.push(entry);
      seenTxIds.add(txId);
    }
  }

  db.ledger = retainedLedger;

  const afterCount = db.ledger.length;
  const afterTotal = db.ledger.reduce((s: number, e: any) => s + Number(e.amount), 0);

  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');

  console.log(`\nReconciliation Complete:`);
  console.log(`Rows:     ${beforeCount} -> ${afterCount}`);
  console.log(`Total:    ₹${beforeTotal.toLocaleString('en-IN')} -> ₹${afterTotal.toLocaleString('en-IN')}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
