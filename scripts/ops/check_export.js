const functional = require('eslint-plugin-functional');
console.log('Has rules direct:', !!functional.rules);
console.log('Has rules in default:', !!(functional.default && functional.default.rules));
