import { classifyTransaction, resetBatchLlmCounter } from '../src/lib/classifier';

async function main() {
  console.log('--- STARTING NVIDIA NIM & CLASSIFIER TEST SUITE ---');

  resetBatchLlmCounter();

  // Test 1: Deterministic case - UPI_INSUFFICIENT_FUNDS
  console.log('\n1. Testing deterministic case: UPI_INSUFFICIENT_FUNDS...');
  const res1 = await classifyTransaction({
    error_code: 'UPI_INSUFFICIENT_FUNDS',
    error_message: 'The account does not have sufficient balance to complete the transaction.'
  });
  console.log(`- Cause: ${res1.cause}`);
  console.log(`- Method: ${res1.method}`);
  console.log(`- LLM Called: ${res1.llmCalled}`);

  if (res1.cause !== 'low_balance' || res1.method !== 'rule_based' || res1.llmCalled !== false) {
    console.error('❌ FAIL: Deterministic low_balance test failed');
    process.exit(1);
  }
  console.log('✅ PASS: Matched known rule without calling LLM.');

  // Test 2: Deterministic case - BANK_TIMEOUT
  console.log('\n2. Testing deterministic case: BANK_TIMEOUT...');
  const res2 = await classifyTransaction({
    error_code: 'BANK_TIMEOUT',
    error_message: 'Destination bank system is currently unavailable or timed out.'
  });
  console.log(`- Cause: ${res2.cause}`);
  console.log(`- Method: ${res2.method}`);
  console.log(`- LLM Called: ${res2.llmCalled}`);

  if (res2.cause !== 'bank_offline' || res2.method !== 'rule_based' || res2.llmCalled !== false) {
    console.error('❌ FAIL: Deterministic bank_offline test failed');
    process.exit(1);
  }
  console.log('✅ PASS: Matched known rule without calling LLM.');

  // Test 3: Deterministic case - MANDATE_REVOKED
  console.log('\n3. Testing deterministic case: MANDATE_REVOKED...');
  const res3 = await classifyTransaction({
    error_code: 'MANDATE_REVOKED',
    error_message: 'The mandate was revoked or cancelled by customer.'
  });
  console.log(`- Cause: ${res3.cause}`);
  console.log(`- Method: ${res3.method}`);
  console.log(`- LLM Called: ${res3.llmCalled}`);

  if (res3.cause !== 'expired_mandate' || res3.method !== 'rule_based' || res3.llmCalled !== false) {
    console.error('❌ FAIL: Deterministic expired_mandate test failed');
    process.exit(1);
  }
  console.log('✅ PASS: Matched known rule without calling LLM.');

  // Test 4: Ambiguous case (LLM disabled or fallback when no API key)
  console.log('\n4. Testing ambiguous case: PROVIDER_DECLINE_99...');
  const res4 = await classifyTransaction({
    error_code: 'PROVIDER_DECLINE_99',
    error_message: 'Debit could not be completed at this time. Generic decline parameters returned.'
  });
  console.log(`- Cause: ${res4.cause}`);
  console.log(`- Method: ${res4.method}`);
  console.log(`- LLM Called: ${res4.llmCalled}`);
  console.log(`- Manual Review Required: ${res4.requiresManualReview}`);

  if (!res4.cause || !res4.method) {
    console.error('❌ FAIL: Ambiguous case returned invalid structure.');
    process.exit(1);
  }
  console.log('✅ PASS: Ambiguous case handled gracefully without crashing.');

  // Test 5: Cache Test
  console.log('\n5. Testing classification cache on repeated ambiguous input...');
  const res5 = await classifyTransaction({
    error_code: 'PROVIDER_DECLINE_99',
    error_message: 'Debit could not be completed at this time. Generic decline parameters returned.'
  });
  console.log(`- Cause: ${res5.cause}`);
  console.log(`- Method: ${res5.method}`);

  if (res5.cause !== res4.cause) {
    console.error('❌ FAIL: Cache test returned mismatched result.');
    process.exit(1);
  }
  console.log('✅ PASS: Cache returned consistent result.');

  console.log('\n🎉 ALL CLASSIFIER & TIE-BREAK TESTS PASSED CLEANLY! ✅');
}

main().catch((err) => {
  console.error('Unhandled error in test suite:', err);
  process.exit(1);
});
