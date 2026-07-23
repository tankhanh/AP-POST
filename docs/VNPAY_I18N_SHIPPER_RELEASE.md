# Hướng dẫn phát hành: VNPAY, đa ngôn ngữ và Shipper

> Cập nhật: 22/07/2026  
> Phạm vi: thay QR bằng VNPAY, chuẩn hóa xác nhận thanh toán, i18n Việt/Anh và vận hành Shipper trên mobile.

## 1. Nguyên tắc trạng thái thanh toán và đơn hàng

Backend là nguồn dữ liệu duy nhất quyết định trạng thái. Frontend, Return URL hoặc thao tác sửa đơn không được tự đánh dấu đơn đã thanh toán.

| Phương thức | Khi tạo đơn | Điều kiện thành công | Trạng thái sau thành công | Thất bại/chưa thanh toán |
| --- | --- | --- | --- | --- |
| `CASH` | Payment `pending`, order `PENDING` | Admin/staff xác nhận đã thực thu | Payment `paid`, order `CONFIRMED` | Giữ `PENDING` |
| `COD` | Payment `pending`, order `PENDING` | Admin/staff xác nhận đã thực thu | Payment `paid`, order `CONFIRMED` | Giữ `PENDING` |
| `MOMO` | Payment `pending`, order `PENDING` | Callback hợp lệ, đúng số tiền và mã giao dịch thành công | Payment `paid`, order `CONFIRMED` | Payment `failed`/`pending`, order giữ `PENDING` |
| `VNPAY` | Payment `pending`, order `PENDING` | IPN hợp lệ; local có thể dùng signed Return khi bật cờ phát triển | Payment `paid`, order `CONFIRMED` | Payment `failed`/`pending`, order giữ `PENDING` |

Các đường cập nhật `PENDING → CONFIRMED` đều phải kiểm tra payment `paid`. Giao dịch online không thể được xác nhận bằng API thanh toán thủ công. Callback được xử lý idempotent để VNPAY/MoMo gọi lại không xác nhận hoặc phát sinh dữ liệu hai lần.

QR/VietQR không còn là lựa chọn tạo đơn, module hoặc màn thanh toán. Mã QR trên phiếu vận đơn dùng để tra cứu vận đơn không phải QR thanh toán và vẫn được giữ lại. Với dữ liệu cũ:

```bash
cd BE
npm run migrate:remove-qr
node dist/scripts/migrate-remove-qr-payments.js --apply
```

Lệnh đầu là dry-run. Chỉ chạy `--apply` sau khi đã backup và kiểm tra số bản ghi.

## 2. Cấu hình VNPAY local

Đăng ký merchant sandbox tại VNPAY để nhận `TmnCode` và `HashSecret`, sau đó cấu hình `BE/.env`:

```dotenv
NODE_ENV=development
API_BASE_URL=http://localhost:8000/api/v1
FRONTEND_URL=http://localhost:4200

VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_TMN_CODE=<sandbox-tmn-code>
VNPAY_HASH_SECRET=<sandbox-hash-secret>
VNPAY_ORDER_INFO=AP Post payment
VNPAY_ORDER_TYPE=other
VNPAY_LOCALE=vn
VNPAY_CURRENCY=VND
VNPAY_RETURN_URL=http://localhost:8000/api/v1/payment/vnpay/return
VNPAY_CONFIRM_ON_RETURN=true
```

`VNPAY_CONFIRM_ON_RETURN=true` chỉ dành cho development vì VNPAY không gọi được IPN vào `localhost`. Backend vẫn kiểm tra chữ ký, merchant, transaction reference, số tiền, `vnp_ResponseCode` và `vnp_TransactionStatus` trước khi xác nhận.

Chạy ứng dụng:

```bash
cd BE
npm run start:dev

cd ../FE
npm start
```

Nếu thiếu credential, backend vẫn có thể chạy các chức năng khác nhưng API tạo VNPAY sẽ trả lỗi cấu hình rõ ràng; giao diện không được giả lập thành công.

## 3. Cấu hình VNPAY production

```dotenv
NODE_ENV=production
API_BASE_URL=https://api.example.com/api/v1
FRONTEND_URL=https://example.com

VNPAY_URL=<production-payment-url-do-vnpay-cap>
VNPAY_TMN_CODE=<production-tmn-code>
VNPAY_HASH_SECRET=<production-hash-secret>
VNPAY_RETURN_URL=https://api.example.com/api/v1/payment/vnpay/return
VNPAY_CONFIRM_ON_RETURN=false
```

Đăng ký với VNPAY:

- Return URL: `https://api.example.com/api/v1/payment/vnpay/return`
- IPN URL: `https://api.example.com/api/v1/payment/vnpay/ipn`
- IPN dùng `GET`, có HTTPS công khai và không bị auth guard chặn.

Return URL phục vụ trình duyệt và điều hướng về `/payment/vnpay-return`; production chỉ IPN server-to-server mới được cập nhật payment/order. IPN kiểm tra checksum trước khi đọc dữ liệu nghiệp vụ, đối chiếu merchant, số tiền, mã giao dịch và phản hồi đúng `RspCode` để VNPAY dừng hoặc retry.

Secret không được commit, log hoặc truyền về frontend. Trước go-live phải chạy một giao dịch sandbox thành công, một giao dịch hủy/thất bại, một callback lặp và một callback sai chữ ký/sai số tiền.

## 4. Đa ngôn ngữ

Website hỗ trợ:

- Tiếng Việt (`vi`) — mặc định.
- English (`en`).
- Chuyển ngôn ngữ toàn cục, lưu lựa chọn vào trình duyệt và cập nhật thuộc tính `lang` của tài liệu.
- Nội dung public, auth, dashboard admin/staff/customer, thanh toán, thông báo và khu vực Shipper.
- Chuỗi động phổ biến, placeholder, tooltip và nhãn hỗ trợ truy cập.
- Định dạng ngày, số và tiền theo locale hiện tại ở các màn đã tích hợp.

Khi bổ sung giao diện mới, ưu tiên API translation theo key/pipe thay vì tự ghép text. Mỗi chuỗi người dùng nhìn thấy cần có cả `vi` và `en`; không dịch mã vận đơn, mã giao dịch, tên riêng hoặc dữ liệu do người dùng nhập.

## 5. Role và giao diện Shipper

Hệ thống có bốn role:

| Role | Phạm vi |
| --- | --- |
| `ADMIN` | Toàn hệ thống, quản lý nhân sự/shipper, phân công đơn |
| `STAFF` | Vận hành trong chi nhánh được gán, phân công shipper cùng chi nhánh |
| `USER` | Tạo và theo dõi đơn thuộc tài khoản |
| `SHIPPER` | Chỉ xem và thao tác các đơn được phân công cho chính mình |

Luồng giao hàng:

```text
UNASSIGNED → ASSIGNED → ACCEPTED → DELIVERING → DELIVERED
                                      └──────→ FAILED → retry
```

Ràng buộc chính:

- Chỉ đơn đã `CONFIRMED` mới được phân công.
- Staff chỉ phân công shipper thuộc cùng chi nhánh; admin có quyền toàn hệ thống.
- Shipper không thể truy cập hoặc cập nhật đơn của shipper khác.
- Nhận đơn, bắt đầu giao, hoàn tất và báo thất bại tuân thủ state machine; request lặp không làm sai trạng thái.
- Hoàn tất giao yêu cầu tên người nhận thực tế và vị trí; ảnh POD/ghi chú là bằng chứng bổ sung.
- Báo giao thất bại ghi lý do, vị trí nếu có và tạo sự kiện tracking.

Giao diện `/shipper` được thiết kế mobile-first:

- Tổng quan công việc, đơn chờ nhận, đang giao, cần xử lý và lịch sử.
- Tìm theo vận đơn/người nhận/số điện thoại, phân trang và refresh.
- Gọi người nhận, mở chỉ đường, cập nhật GPS.
- Chụp/chọn ảnh POD, xác nhận người nhận, ghi chú giao hàng.
- Báo giao không thành công và thử giao lại theo quyền/state hợp lệ.
- Hồ sơ Shipper, đăng xuất và bottom navigation có safe-area cho thiết bị tai thỏ.
- Touch target tối thiểu phù hợp mobile, trạng thái loading/empty/error và nút chống bấm lặp.

Production frontend phải cho phép `camera=(self)` và `geolocation=(self)` trong `Permissions-Policy`; microphone tiếp tục bị khóa.

## 6. Quản lý Shipper

Admin có màn `/admin/shippers` để:

- Liệt kê, tìm kiếm, lọc và phân trang shipper.
- Tạo tài khoản Shipper, gán chi nhánh và trạng thái hoạt động.
- Kích hoạt/khóa tài khoản và theo dõi tải công việc.
- Xem số đơn đang phụ trách/hoàn tất và phân công lại khi nghiệp vụ cho phép.

Staff lấy danh sách shipper khả dụng trong đúng phạm vi chi nhánh khi phân công đơn. Backend luôn kiểm tra lại role, trạng thái tài khoản và chi nhánh; không tin dữ liệu lọc từ frontend.

## 7. Kiểm thử trước phát hành

```bash
cd BE
npm run format:check
npm run lint
npm test -- --runInBand
npm run build

cd ../FE
npm run i18n:audit
npm run build
npm run test:ci
```

Kết quả kiểm định cuối ngày 22/07/2026: backend 46/46 test, frontend 11/11 test, audit i18n 908/908 chuỗi và cả hai production build đều thành công.

Smoke test tối thiểu ở 390 px, 768 px và 1440 px:

1. Chuyển Việt/Anh trên public, auth, dashboard và Shipper; tải lại vẫn giữ ngôn ngữ.
2. Tạo CASH/COD: đơn ở `PENDING`; xác nhận thu tiền hợp lệ mới sang `CONFIRMED`.
3. Tạo VNPAY: hủy/thất bại giữ order `PENDING`; signed success mới `CONFIRMED`.
4. Gửi IPN success hai lần; dữ liệu chỉ được cập nhật một lần.
5. Gửi IPN sai checksum/sai số tiền; payment và order không đổi.
6. Admin/staff thử đổi trực tiếp order chưa trả tiền sang `CONFIRMED`; backend phải từ chối.
7. Phân công → shipper nhận → bắt đầu → cập nhật GPS/POD → hoàn tất.
8. Báo giao lỗi → retry; shipper khác thử truy cập đơn và phải bị từ chối.

## 8. Phần cần hạ tầng bên ngoài source code

Các phần sau không thể hoàn tất chỉ bằng code trong repository:

- Credential VNPAY/MoMo live và đăng ký callback HTTPS với nhà cung cấp.
- SMTP thật, domain sender và kiểm tra deliverability.
- Object storage bền vững cho POD/upload. Disk local/Render là tạm thời và không phù hợp lưu bằng chứng lâu dài.
- MongoDB replica set, backup/PITR và diễn tập restore.
- Error tracking, log aggregation, uptime/latency alert và quy trình trực sự cố.
- Kiểm thử E2E trên staging với domain, database, email và payment sandbox thật.

Chỉ mở traffic production sau khi các mục trên có chủ sở hữu, secret thật, monitoring và phương án rollback.
