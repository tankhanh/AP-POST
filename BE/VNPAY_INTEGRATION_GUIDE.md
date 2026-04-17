# VNPAY Payment Integration Documentation

## Overview
This document provides a complete guide for the VNPAY payment integration in the AP-POST project. VNPAY is a Vietnamese payment gateway that supports credit/debit card payments.

## Configuration

Your VNPAY credentials are configured in the `.env` file:

```
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_TMN_CODE=GMDHGXBT
VNPAY_HASH_SECRET=3O4OWKHJH9Y1CE7TIVO9IHMQDK0RNCQR
VNPAY_ORDER_INFO=Bill Payment
VNPAY_ORDER_TYPE=Bake Payment
VNPAY_LOCALE=vn
VNPAY_CURRENCY=VND
```

**Environment Variables Explanation:**
- `VNPAY_URL`: The payment gateway URL (sandbox for testing, production URL for live)
- `VNPAY_TMN_CODE`: Terminal Code (Merchant ID provided by VNPAY)
- `VNPAY_HASH_SECRET`: Secret key for generating secure hash signatures
- `VNPAY_ORDER_INFO`: Default order information displayed on payment page
- `VNPAY_ORDER_TYPE`: Transaction type
- `VNPAY_LOCALE`: Language locale (vn = Vietnamese, en = English)
- `VNPAY_CURRENCY`: Currency code (VND = Vietnamese Dong)

## Project Structure

```
src/modules/vnpay/
├── vnpay.controller.ts       # API endpoints
├── vnpay.service.ts          # Business logic
├── vnpay.module.ts           # Module definition
└── dto/
    └── create-vnpay-payment.dto.ts  # Data transfer objects
```

## API Endpoints

### 1. Create Payment URL

**Endpoint:** `POST /payment/vnpay/create`

**Description:** Creates a VNPAY payment URL for the customer to complete payment.

**Request Body:**
```json
{
  "orderId": "6734567890abcdef12345678"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Payment URL created successfully",
  "data": {
    "paymentUrl": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?...",
    "transactionCode": "ORDER-123-ABCD123",
    "amount": 50000,
    "orderId": "6734567890abcdef12345678"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Missing orderId or no amount to pay
- `404 Not Found`: Order not found
- `400 Bad Request`: Order has been deleted

### 2. Return URL Handler

**Endpoint:** `GET /payment/vnpay/return`

**Description:** Handles the return from VNPAY after payment processing. This endpoint verifies the payment signature and redirects to frontend.

**Query Parameters (from VNPAY):**
- `vnp_Amount`: The amount in hundredth VND
- `vnp_BankCode`: Bank code
- `vnp_BankTranNo`: Bank transaction number
- `vnp_CardType`: Card type
- `vnp_OrderInfo`: Order information
- `vnp_PayDate`: Payment date
- `vnp_ResponseCode`: Response code (00 = success)
- `vnp_TmnCode`: Merchant code
- `vnp_TransactionNo`: VNPAY transaction number
- `vnp_TxnRef`: Transaction reference (our transaction code)
- `vnp_SecureHash`: Secure hash for signature verification

**Redirect URL (Success):**
```
https://ap-post.vercel.app/payment-success?status=success&transactionCode=ORDER-123-ABCD123&amount=50000
```

**Redirect URL (Failed):**
```
https://ap-post.vercel.app/payment-success?status=failed&message=Payment%20failed&responseCode=01
```

### 3. IPN Webhook Handler

**Endpoint:** `POST /payment/vnpay/ipn`

**Description:** Receives and processes IPN (Instant Payment Notification) callbacks from VNPAY. This is a server-to-server communication.

**Request Body:**
```json
{
  "vnp_Amount": "5000000",
  "vnp_BankCode": "SACOMBANK",
  "vnp_BankTranNo": "20231215123456",
  "vnp_CardType": "CC",
  "vnp_OrderInfo": "Bill Payment",
  "vnp_PayDate": "20231215143000",
  "vnp_ResponseCode": "00",
  "vnp_TmnCode": "GMDHGXBT",
  "vnp_TransactionNo": "14356325",
  "vnp_TxnRef": "ORDER-123-ABCD123",
  "vnp_SecureHash": "hash_value_here"
}
```

**Response:**
```json
{
  "RspCode": "00",
  "Message": "Confirm success"
}
```

**Response Codes:**
- `00`: Success
- `01`: Transaction not found or payment failed
- `02`: Transaction already confirmed
- `97`: Invalid signature
- `99`: Unspecified error

### 4. Get Payment Details

**Endpoint:** `GET /payment/vnpay/:transactionCode`

**Description:** Retrieves payment details by transaction code.

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "orderId": "6734567890abcdef12345678",
    "amount": 50000,
    "method": "VNPAY",
    "status": "paid",
    "transactionId": "ORDER-123-ABCD123",
    "createdAt": "2023-12-15T10:00:00.000Z",
    "updatedAt": "2023-12-15T10:05:00.000Z"
  }
}
```

### 5. Cancel Payment

**Endpoint:** `POST /payment/vnpay/:transactionCode/cancel`

**Description:** Cancels a pending payment. Can only cancel payments that are not already paid.

**Response:**
```json
{
  "success": true,
  "message": "Payment cancelled successfully"
}
```

## Implementation Flow

### 1. Payment Creation Flow

```
Frontend
  ↓
POST /payment/vnpay/create
  ↓
VnpayService.createPaymentUrl()
  ├─ Verify order exists
  ├─ Calculate amount
  ├─ Create payment record (status: pending)
  ├─ Generate transaction code
  └─ Build VNPAY URL with signature
  ↓
Return paymentUrl to frontend
  ↓
Frontend redirects user to VNPAY payment page
  ↓
User completes payment on VNPAY
```

### 2. Payment Return Flow

```
VNPAY Payment Page
  ↓
User completes/cancels payment
  ↓
VNPAY redirects to GET /payment/vnpay/return
  ↓
VnpayService.verifyReturnUrl()
  ├─ Verify signature
  ├─ Check response code
  └─ Update payment status if successful
  ↓
Redirect to frontend success/failed page
  ↓
Frontend shows result to user
```

### 3. IPN Callback Flow

```
VNPAY Server
  ↓
POST /payment/vnpay/ipn (webhook)
  ↓
VnpayService.verifyIpn()
  ├─ Verify signature
  ├─ Check if transaction exists
  ├─ Check if already processed
  └─ Update payment status
  ↓
Update Order status to CONFIRMED
  ↓
Return success response to VNPAY
```

## Security Implementation

### 1. Signature Generation & Verification

All VNPAY requests and responses are secured using HMAC SHA512 signatures:

```typescript
// Example: Generating signature
const sortedParams = sortObject(vnp_Params);
let signInput = '';
Object.keys(sortedParams).forEach((key) => {
  signInput += `&${key}=${sortedParams[key]}`;
});

const signature = crypto
  .createHmac('sha512', HASH_SECRET)
  .update(signInput)
  .digest('hex');
```

### 2. Amount Handling

- Amounts are stored in database as regular numbers (VND)
- When sending to VNPAY, amounts are multiplied by 100 (to convert to hundredth VND)
- When receiving from VNPAY, amounts are divided by 100 to convert back to VND

### 3. Transaction Code Generation

Transaction codes are unique per transaction:
```
Format: {orderId}-{timestamp}-{randomString}
Example: ORDER-123-1702642800000-ABC123
```

## Payment Status Flow

```
pending → paid (IPN or Return received with success code)
       → failed (IPN or Return received with failure code)
       → cancelled (User cancels via cancel endpoint)
```

## Order Status Update

When a payment is successfully confirmed:
1. Payment status is updated to `paid`
2. Associated order status is updated to `CONFIRMED`
3. Order can now proceed to shipping

## Webhook Configuration (VNPAY Dashboard)

To enable IPN callbacks, configure the IPN URL in your VNPAY merchant dashboard:

**IPN URL:** `https://your-domain.com/payment/vnpay/ipn`
**Return URL:** `https://your-domain.com/payment/vnpay/return`

## Error Handling

### Common Errors:

1. **Invalid Signature**
   - Cause: HASH_SECRET mismatch or parameter tampering
   - Solution: Verify HASH_SECRET in .env, ensure no parameters are modified

2. **Amount Mismatch**
   - Cause: Amount changed between creation and payment
   - Solution: Use stored amount in database, don't recalculate

3. **Transaction Not Found**
   - Cause: Transaction code doesn't match
   - Solution: Verify transaction code format and storage

4. **Duplicate Payment**
   - Cause: IPN received twice for same transaction
   - Solution: Check idempotency - check if already processed before updating

## Testing

### Sandbox Mode

For testing, use VNPAY sandbox:
- **URL:** https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
- **Test Cards:**
  - Visa: 4111111111111111 (any future expiry)
  - MasterCard: 5555555555554444 (any future expiry)
- **CVV:** Any 3-digit number
- **Password:** Any 6-digit number

### Test Workflow:

1. Create order in database
2. Call POST /payment/vnpay/create with order ID
3. Get payment URL from response
4. Open payment URL in browser
5. Use test card to complete payment
6. Verify payment status is updated to `paid`
7. Verify order status is updated to `CONFIRMED`

## Database Queries

### Check Payment Status:
```javascript
// Mongoose
const payment = await Payment.findOne({ transactionId: 'ORDER-123-ABCD123' });
```

### Check Failed Payments:
```javascript
const failedPayments = await Payment.find({ 
  method: 'VNPAY',
  status: 'failed'
});
```

### Check Amount by Period:
```javascript
const totalAmount = await Payment.aggregate([
  {
    $match: {
      method: 'VNPAY',
      status: 'paid',
      createdAt: { $gte: startDate, $lte: endDate }
    }
  },
  {
    $group: {
      _id: null,
      total: { $sum: '$amount' }
    }
  }
]);
```

## Logging and Monitoring

All critical operations are logged with console.log:
- Payment URL creation
- Signature generation and verification
- IPN callback processing
- Payment status updates
- Error messages

For production, replace console.log with proper logging system:
```typescript
private logger = new Logger(VnpayService.name);
this.logger.log('Payment created');
this.logger.error('Verification failed', error);
```

## Migration from Sandbox to Production

1. **Get Production Credentials:**
   - Contact VNPAY support for production TMN_CODE and HASH_SECRET
   - Get production API endpoints

2. **Update .env:**
   ```
   VNPAY_URL=https://pay.vnpay.vn/vpcpay.html  # Production URL
   VNPAY_TMN_CODE=your_production_tmn_code
   VNPAY_HASH_SECRET=your_production_hash_secret
   ```

3. **Test Thoroughly:**
   - Verify all endpoints work
   - Test payment flow end-to-end
   - Monitor IPN callbacks

4. **Configure Webhook URLs:**
   - Update VNPAY dashboard with production URLs
   - Ensure URLs are HTTPS

## Troubleshooting

### Payment URL Returns Empty or Error:
- Check VNPAY configuration in .env
- Verify order exists in database
- Check if order is deleted

### Signature Verification Fails:
- Verify HASH_SECRET is correct
- Check parameter encoding
- Ensure parameters are sorted correctly

### IPN Callbacks Not Received:
- Configure webhook URL in VNPAY dashboard
- Ensure endpoint is publicly accessible
- Check server logs for errors

### Order Status Not Updated:
- Verify IPN callback is being processed
- Check if payment status is being updated to 'paid'
- Check order update in database

## Support

For VNPAY support:
- Website: https://vnpay.vn
- Hotline: (based on VNPAY documentation)
- Email: support@vnpay.vn
