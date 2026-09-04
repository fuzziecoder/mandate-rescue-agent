import { resetAndGenerateFreshDataset } from '../src/lib/synthetic/resetDataset';

async function run() {
  console.log('====================================================');
  console.log('  RESET & GENERATE SYNTHETIC DATASET (CLI)          ');
  console.log('====================================================');

  try {
    const result = await resetAndGenerateFreshDataset({
      transactionCount: 300,
      requestedBy: 'cli',
      preserveSettings: true
    });

    console.log('\n[SUCCESS] Dataset reset and generation completed successfully!');
    console.log(`\nMetrics:`);
    console.log(`  - Dataset ID: ${result.datasetId}`);
    console.log(`  - Backup Location: ${result.backupPath}`);
    console.log(`  - New DB Location: ${result.dbPath}`);
    console.log(`  - Transactions Generated: ${result.count}`);
    console.log(`  - Total Revenue At Risk: ₹${result.totalAtRisk.toLocaleString('en-IN')}`);
    console.log(`  - Seed Used: ${result.seed === null ? 'random' : result.seed}`);
    
    console.log(`\nCause Distribution:`);
    for (const [cause, count] of Object.entries(result.causeDistribution)) {
      console.log(`  - ${cause}: ${count}`);
    }
    
    console.log('\n====================================================\n');
  } catch (error: any) {
    console.error('\n[ERROR] Reset failed:');
    console.error(error.message);
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
