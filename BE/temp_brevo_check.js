const brevo = require('@getbrevo/brevo');
console.log('Brevo export keys:', Object.keys(brevo));
const bc = new brevo.BrevoClient();
console.log('BrevoClient prototype keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(bc)).filter(k => k !== 'constructor'));
console.log('BrevoClient own props:', Object.keys(bc));

// Check the TransactionalEmailsApi
const api = new brevo.TransactionalEmailsApi();
console.log('TransactionalEmailsApi prototype keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(api)).filter(k => k !== 'constructor'));
</｜DSML｜parameter>
</｜DSML｜invoke>
</｜DSML｜tool_calls>
