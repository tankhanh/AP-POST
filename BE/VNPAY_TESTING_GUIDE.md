# VNPAY Payment System - Testing Guide

## Manual Testing Workflow

### Step 1: Start Your Application

```bash
# Terminal 1 - Backend
cd AS-POST/BE
npm install
npm run start:dev
```

Your server should be running on `http://localhost:8000`

### Step 2: Create a Test Order

First, ensure you have an order in your database. You can:

1. Use your admin dashboard to create an order
2. Use your API to create an order via `/orders` endpoint
3. Use MongoDB directly to create a test order

**Sample Order Structure:**
```json
{
  "_id": ObjectId("507f1f77bcf86cd799439011"),
  "userId": ObjectId("507f191e810c19729de860ea"),
  "waybill": "AP-2023-12345",
  "senderName": "John Doe",
  "receiverName": "Jane Doe",
  "email": "user@example.com",
  "shippingFee": 50000,
  "codValue": 0,
  "shippingFeePayer": "SENDER",
  "status": "PENDING",
  "isDeleted": false
}
```

### Step 3: Test Payment Creation

**Using cURL:**
```bash
curl -X POST http://localhost:8000/payment/vnpay/create \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "507f1f77bcf86cd799439011"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Payment URL created successfully",
  "data": {
    "paymentUrl": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_Version=2.1.0&vnp_Command=pay&...",
    "transactionCode": "507f1f77bcf86cd799439011-1702726800000-ABC123",
    "amount": 50000,
    "orderId": "507f1f77bcf86cd799439011"
  }
}
```

**Using Postman:**
1. Create a new POST request
2. URL: `http://localhost:8000/payment/vnpay/create`
3. Body (raw JSON):
   ```json
   {
     "orderId": "YOUR_ORDER_ID_HERE"
   }
   ```
4. Send and copy the `paymentUrl` from response

### Step 4: Test Payment Processing

**Option A: Manual Testing in Browser**

1. Copy the `paymentUrl` from Step 3 response
2. Open it in a new browser tab
3. VNPAY login page should appear
4. Use sandbox test credentials:
   - **Card Number:** 4111111111111111
   - **Cardholder Name:** Any name
   - **Expiry:** 12/2030
   - **CVV:** 123
   - **OTP:** 123456 (or follow prompts)

5. Click "Pay" to complete the test payment

### Step 5: Verify Payment Status

After payment (success or failure), you'll be redirected to your frontend payment success page.

**Check in Database:**
```json
// MongoDB query
db.payments.findOne({ transactionId: "YOUR_TRANSACTION_CODE" })

// Expected result for successful payment:
{
  "_id": ObjectId("..."),
  "orderId": ObjectId("507f1f77bcf86cd799439011"),
  "amount": 50000,
  "method": "VNPAY",
  "status": "paid",
  "transactionId": "507f1f77bcf86cd799439011-1702726800000-ABC123",
  "createdAt": ISODate("2023-12-16T10:00:00.000Z"),
  "updatedAt": ISODate("2023-12-16T10:05:00.000Z")
}
```

**Check Order Status:**
```json
// MongoDB query
db.orders.findOne({ _id: ObjectId("507f1f77bcf86cd799439011") })

// Order status should be updated to CONFIRMED
// "status": "CONFIRMED"
```

### Step 6: Test IPN Callback (Webhook)

VNPAY will send an IPN callback to your server. To simulate this:

**Using cURL (simulate VNPAY IPN):**
```bash
curl -X POST http://localhost:8000/payment/vnpay/ipn \
  -H "Content-Type: application/json" \
  -d '{
    "vnp_Amount": "5000000",
    "vnp_BankCode": "SACOMBANK",
    "vnp_BankTranNo": "20231216123456",
    "vnp_CardType": "CC",
    "vnp_OrderInfo": "Bill Payment",
    "vnp_PayDate": "20231216143000",
    "vnp_ResponseCode": "00",
    "vnp_TmnCode": "GMDHGXBT",
    "vnp_TransactionNo": "14356325",
    "vnp_TxnRef": "YOUR_TRANSACTION_CODE_HERE",
    "vnp_SecureHash": "COMPUTED_HASH"
  }'
```

**Note:** You need to compute the correct `vnp_SecureHash`. Use this Node.js snippet:

```javascript
const crypto = require('crypto');

const data = {
  vnp_Amount: "5000000",
  vnp_BankCode: "SACOMBANK",
  vnp_BankTranNo: "20231216123456",
  vnp_CardType: "CC",
  vnp_OrderInfo: "Bill Payment",
  vnp_PayDate: "20231216143000",
  vnp_ResponseCode: "00",
  vnp_TmnCode: "GMDHGXBT",
  vnp_TransactionNo: "14356325",
  vnp_TxnRef: "YOUR_TRANSACTION_CODE"
};

const HASH_SECRET = "3O4OWKHJH9Y1CE7TIVO9IHMQDK0RNCQR";

const sorted = Object.keys(data).sort().reduce((acc, key) => {
  acc[key] = data[key];
  return acc;
}, {});

let signInput = '';
Object.keys(sorted).forEach((key) => {
  signInput += `&${key}=${sorted[key]}`;
});
signInput = signInput.substring(1);

const hash = crypto
  .createHmac('sha512', HASH_SECRET)
  .update(signInput)
  .digest('hex');

console.log('vnp_SecureHash:', hash);
```

### Step 7: Test Payment Details Retrieval

**Using cURL:**
```bash
curl -X GET http://localhost:8000/payment/vnpay/YOUR_TRANSACTION_CODE_HERE
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "_id": ObjectId("..."),
    "orderId": ObjectId("507f1f77bcf86cd799439011"),
    "amount": 50000,
    "method": "VNPAY",
    "status": "paid",
    "transactionId": "YOUR_TRANSACTION_CODE_HERE",
    "createdAt": "2023-12-16T10:00:00.000Z",
    "updatedAt": "2023-12-16T10:05:00.000Z"
  }
}
```

### Step 8: Test Payment Cancellation

**Using cURL:**
```bash
curl -X POST http://localhost:8000/payment/vnpay/YOUR_TRANSACTION_CODE_HERE/cancel \
  -H "Content-Type: application/json"
```

**Expected Response (if payment not yet paid):**
```json
{
  "success": true,
  "message": "Payment cancelled successfully"
}
```

**Expected Error (if already paid):**
```json
{
  "statusCode": 400,
  "message": "Cannot cancel paid payment"
}
```

## Automated Testing Scripts

### Node.js Test Script

Create `test-vnpay.js`:

```javascript
const http = require('http');

const BASE_URL = 'http://localhost:8000';
const ORDER_ID = '507f1f77bcf86cd799439011'; // Replace with actual order ID

async function testVnpayFlow() {
  try {
    console.log('🔄 Starting VNPAY Payment Flow Test...\n');

    // Test 1: Create Payment
    console.log('📝 Test 1: Creating payment...');
    const createResponse = await post('/payment/vnpay/create', {
      orderId: ORDER_ID
    });
    
    if (!createResponse.success) {
      throw new Error(`Payment creation failed: ${createResponse.message}`);
    }
    
    const { transactionCode, paymentUrl, amount } = createResponse.data;
    console.log('✅ Payment created successfully!');
    console.log(`   Transaction Code: ${transactionCode}`);
    console.log(`   Amount: ${amount} VND`);
    console.log(`   Payment URL: ${paymentUrl.substring(0, 50)}...\n`);

    // Test 2: Get Payment Details
    console.log('📊 Test 2: Retrieving payment details...');
    const detailsResponse = await get(`/payment/vnpay/${transactionCode}`);
    
    if (!detailsResponse.success) {
      throw new Error(`Get details failed: ${detailsResponse.message}`);
    }
    
    console.log('✅ Payment details retrieved!');
    console.log(`   Status: ${detailsResponse.data.status}`);
    console.log(`   Method: ${detailsResponse.data.method}\n`);

    // Test 3: Cancel Payment
    console.log('❌ Test 3: Cancelling payment...');
    const cancelResponse = await post(`/payment/vnpay/${transactionCode}/cancel`, {});
    
    if (cancelResponse.success) {
      console.log('✅ Payment cancelled successfully!\n');
    } else {
      console.log(`⚠️ Cancel failed (expected if already paid): ${cancelResponse.message}\n`);
    }

    console.log('✨ All tests completed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

async function post(path, data) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });

    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

async function get(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8000,
      path: path,
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });

    req.on('error', reject);
    req.end();
  });
}

testVnpayFlow();
```

**Run the test:**
```bash
node test-vnpay.js
```

## Production Testing Checklist

Before deploying to production, verify:

- [ ] All environment variables are correctly set
- [ ] VNPAY production credentials are configured
- [ ] IPN webhook URL is configured in VNPAY dashboard
- [ ] Return URL is correctly set in frontend
- [ ] HTTPS is enabled on all endpoints
- [ ] Database backups are in place
- [ ] Error logging is configured
- [ ] Payment monitoring is set up
- [ ] Load testing is completed
- [ ] Security audit is passed

## Debugging

### Enable Request Logging

Add this to `vnpay.service.ts`:

```typescript
import { Logger } from '@nestjs/common';

export class VnpayService {
  private logger = new Logger(VnpayService.name);

  async createPaymentUrl(...) {
    this.logger.debug(`Creating payment for order: ${orderId}, amount: ${amount}`);
    // ... rest of code
  }
}
```

### Check Server Logs

```bash
# Watch logs in real-time
npm run start:dev | grep -i vnpay

# Or check if using pm2
pm2 logs app-name
```

### Common Debug Issues

1. **Payment URL not generated**
   - Check VNPAY environment variables
   - Verify order exists

2. **Signature mismatch**
   - Print signInput and hash
   - Verify HASH_SECRET
   - Check parameter sorting

3. **IPN not updating**
   - Verify webhook URL is public
   - Check server firewall settings
   - Monitor incoming requests

## Monitoring in Production

Monitor these metrics:
- Payment success rate
- Average payment amount
- Failed transactions
- IPN callback response time
- Payment processing latency
- Error rates by type

Use tools like:
- PM2 Plus for application monitoring
- Sentry for error tracking
- DataDog for metrics and logs
- MongoDB Atlas for database monitoring
