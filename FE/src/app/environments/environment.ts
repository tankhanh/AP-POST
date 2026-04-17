export const env = {
  production: true,
  baseUrl: 'https://ap-post-api.onrender.com/api/v1',
  apiUrl: 'https://ap-post-api.onrender.com/api/v1',

  // baseUrl: 'http://localhost:8000/api/v1',
  // apiUrl: 'http://localhost:8000/api/v1',

  // Payment Gateway Configurations
  vnpay: {
    sandboxUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    productionUrl: 'https://payment.vnpay.vn/paymentv2/vpcpay.html',
    returnPath: '/payment/vnpay-return',
  },

  vietqr: {
    // VietQR configurations (managed on backend, frontend uses API endpoints)
    returnPath: '/payment/vietqr-return',
  },
};

// DEVELOPMENT - Uncomment to use localhost
// export const env = {
//   production: false,
// //   baseUrl: 'http://localhost:8000/api/v1',
//   apiUrl: 'http://localhost:8000/api/v1',

//   vnpay: {
//     sandboxUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
//     productionUrl: 'https://payment.vnpay.vn/paymentv2/vpcpay.html',
//     returnPath: '/payment/vnpay-return',
//   },

//   vietqr: {
//     returnPath: '/payment/vietqr-return',
//   }
// };
