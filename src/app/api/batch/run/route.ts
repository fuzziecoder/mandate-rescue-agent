import { NextResponse } from 'next/server';
import { 
  getTransactions, 
  clearDatabase, 
  getBatchMetrics,
  getPipelineTrace
} from '@/lib/db';
import { processTransactionPipeline } from '@/lib/pipeline';

// A module-level variable to keep track if a batch is active.
// In serverless, this might reset, but since we are running locally and writing to a local JSON file,
// we can also write the batch status directly to the db.json file or check classifications count.
let isRunning = false;

export async function GET() {
  try {
    const txs = await getTransactions();
    const totalCount = txs.length;

    // Check how many have been executed
    let executedCount = 0;
    for (const tx of txs) {
      const trace = await getPipelineTrace(tx.id);
      if (trace?.execution) {
        executedCount++;
      }
    }

    let status: 'idle' | 'running' | 'completed' = 'idle';
    if (executedCount > 0) {
      if (executedCount < totalCount) {
        status = 'running';
      } else {
        status = 'completed';
        isRunning = false; // ensure reset
      }
    }

    const metrics = await getBatchMetrics();

    return NextResponse.json({
      success: true,
      status,
      progress: totalCount > 0 ? Math.round((executedCount / totalCount) * 100) : 0,
      totalCount,
      processedCount: executedCount,
      metrics
    });
  } catch (error: any) {
    console.error('Error fetching batch status:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST() {
  if (isRunning) {
    return NextResponse.json({ success: false, message: 'Batch is already running' }, { status: 400 });
  }

  try {
    // 1. Fetch all transactions
    const txs = await getTransactions();
    if (txs.length === 0) {
      return NextResponse.json({ success: false, message: 'No transactions found. Run data generator first.' }, { status: 400 });
    }

    // 2. Clear old run results
    // We clear all tables except the core transactions table.
    // To do this, we truncate classifications, decisions, guardrail_checks, executions, and audit_log.
    // In our db.ts clearDatabase clears all cascade, but we need to keep transactions!
    // Let's implement a clearPipelineData function in db.ts, or just implement it here.
    // In db.ts clearDatabase clears everything. Let's make a manual delete for run tables here so we preserve transactions.
    // Wait, let's write a simple helper or check how db.ts does it.
    // Let's implement a clearPipelineData inside db.ts or run it directly here.
    // We can clear it by reading/writing to db.json directly or running SQL queries.
    // Let's do it cleanly:
    const dbUrl = process.env.DATABASE_URL;
    const { createClient } = require('@supabase/supabase-js');
    const { Pool } = require('pg');

    if (dbUrl) {
      const pool = new Pool({ connectionString: dbUrl });
      await pool.query('TRUNCATE classifications, decisions, guardrail_checks, executions, audit_log CASCADE');
      await pool.end();
    } else if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      await client.from('audit_log').delete().neq('transaction_id', '');
      await client.from('executions').delete().neq('transaction_id', '');
      await client.from('guardrail_checks').delete().neq('transaction_id', '');
      await client.from('decisions').delete().neq('transaction_id', '');
      await client.from('classifications').delete().neq('transaction_id', '');
    } else {
      const fs = require('fs');
      const path = require('path');
      const dbPath = path.join(process.cwd(), 'data', 'db.json');
      if (fs.existsSync(dbPath)) {
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        db.classifications = [];
        db.decisions = [];
        db.guardrail_checks = [];
        db.executions = [];
        db.audit_log = [];
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
      }
    }

    isRunning = true;

    // 3. Process transactions in background chunk-by-chunk to prevent timeouts
    // We return response immediately, letting process run in background.
    // This is perfect for serverless/local run environments.
    runBatchInBackground(txs);

    return NextResponse.json({
      success: true,
      message: 'Batch recovery pipeline started in the background.',
      status: 'running',
      progress: 0
    });
  } catch (error: any) {
    console.error('Error starting batch run:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

async function runBatchInBackground(txs: any[]) {
  console.log(`Starting background batch processing for ${txs.length} transactions...`);
  
  // We process in small chunks to prevent event loop block or API rate limits
  const chunkSize = 10;
  for (let i = 0; i < txs.length; i += chunkSize) {
    const chunk = txs.slice(i, i + chunkSize);
    
    // Process chunk in parallel
    await Promise.all(chunk.map(async (tx) => {
      try {
        await processTransactionPipeline(tx);
      } catch (err) {
        console.error(`Pipeline failed for txn ${tx.id}:`, err);
      }
    }));
    
    // Tiny delay between chunks to be friendly to rate limits (e.g. 50ms)
    await new Promise(resolve => setTimeout(resolve, 50));
    
    console.log(`Completed batch chunk ${Math.min(i + chunkSize, txs.length)} / ${txs.length}`);
  }
  
  console.log('Background batch recovery pipeline execution completed successfully!');
  isRunning = false;
}
