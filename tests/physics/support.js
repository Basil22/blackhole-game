// tests/physics/support.js — shared mini-harness for physics audit suites.
export let passed = 0;
export let failed = 0;

export function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok — ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL — ${name}\n    ${e.message}`);
  }
}

export function report() {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}