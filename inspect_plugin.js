
const functional = require('eslint-plugin-functional');
console.log('Type:', typeof functional);
console.log('Keys:', Object.keys(functional));
console.log('Has Default?', 'default' in functional);
if (functional.default) {
    console.log('Default Keys:', Object.keys(functional.default));
}
