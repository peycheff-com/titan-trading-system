const nats = require('nats');
console.log('Exports:', Object.keys(nats).filter(k => k.toLowerCase().includes('jetstream')));
console.log('All Exports:', Object.keys(nats));
