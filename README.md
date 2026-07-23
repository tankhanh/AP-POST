# AP Post

Hệ thống quản lý giao nhận gồm Angular 20 ở `FE/` và NestJS 11 + MongoDB ở
`BE/`. Project hỗ trợ đặt đơn B2C/B2B, vận đơn, tracking, thông báo thời gian
thực, thanh toán MoMo/VNPAY, giao diện Việt/Anh và quy trình giao hàng dành riêng
cho Shipper trên thiết bị di động.

Báo cáo đầy đủ về chức năng, phần còn thiếu và checklist go-live nằm tại
[`docs/PROJECT_AUDIT_PRODUCTION.md`](docs/PROJECT_AUDIT_PRODUCTION.md).
Hướng dẫn cấu hình và phát hành VNPAY/i18n/Shipper nằm tại
[`docs/VNPAY_I18N_SHIPPER_RELEASE.md`](docs/VNPAY_I18N_SHIPPER_RELEASE.md).

## Yêu cầu

- Node.js 20.19 trở lên
- npm 10 trở lên
- MongoDB 7 trở lên (local hoặc MongoDB Atlas)

## Chạy local

```bash
cd BE
cp .env.example .env
npm ci
npm run dev
```

Điền tối thiểu `MONGO_URL`, hai JWT secret và thời hạn token theo
`BE/.env.example`. Backend mặc định chạy tại `http://localhost:8000/api/v1`;
Swagger chỉ bật ngoài production tại `http://localhost:8000/docs`.

Ở terminal khác:

```bash
cd FE
npm ci
npm start
```

Frontend chạy tại `http://localhost:4200`. Khách chưa đăng nhập có thể tạo đơn tại
`/ship`; OTP được gửi đến email đã nhập. URL API được chọn theo hostname và có thể
ghi đè lúc deploy bằng `/runtime-config.js`:

```js
window.__AP_POST_CONFIG__ = {
  apiBaseUrl: "https://api.example.com/api/v1",
};
```

## Kiểm tra chất lượng

```bash
# Backend
cd BE
npm run check
npm audit

# Frontend
cd FE
npm run build
npm run test:ci
npm audit
```

CI tự động thực hiện audit, format check, lint, unit test và production build
cho mỗi pull request/push lên `main`.

## Cấu hình tích hợp

- SMTP: `EMAIL_*`
- MoMo: `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`
- VNPAY: `VNPAY_URL`, `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_RETURN_URL`
- CORS HTTP/WebSocket: danh sách phân cách bằng dấu phẩy trong `CORS_ORIGINS`

Callback/IPN phải trỏ về HTTPS public của backend. Trạng thái thanh toán chỉ
được cập nhật từ callback/IPN đã xác thực. Production dùng IPN GET làm nguồn xác
nhận; signed Return chỉ được phép đối soát ở local khi `VNPAY_CONFIRM_ON_RETURN=true`.
Thanh toán QR/VietQR đã được gỡ khỏi luồng tạo đơn.

## Triển khai

- Vercel frontend cần các secret `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
  `VERCEL_PROJECT_ID`.
- Render backend cần `RENDER_API_KEY`, `RENDER_SERVICE_ID` và toàn bộ biến môi
  trường production trong `BE/.env.example`.
- Đặt `NODE_ENV=production`, `SWAGGER_ENABLED=false`, dùng secret ngẫu nhiên
  khác nhau, và không commit file `.env`.
- Chạy `npm run db:indexes` trong `BE/` khi triển khai schema/index mới. Lệnh chỉ
  tạo index được khai báo và không tự xóa index hiện có.
- Frontend production có service worker; đảm bảo output chứa `ngsw.json` và
  `ngsw-worker.js` trước khi deploy.
