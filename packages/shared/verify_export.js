const shared = require('./dist/index.js');

console.log('Checking exports from @titan/shared/dist/index.js');
console.log('Keys:', Object.keys(shared));

if (shared.signedProposalSchema) {
  console.log('SUCCESS: signedProposalSchema is exported.');
} else {
  console.error('FAILURE: signedProposalSchema is UNDEFINED.');
  process.exit(1);
}
