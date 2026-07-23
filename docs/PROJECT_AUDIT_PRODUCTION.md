# Báo cáo rà soát và mức độ sẵn sàng production — AP Post

> Thời điểm rà soát: 22/07/2026  
> Phạm vi: toàn bộ mã nguồn `BE/`, `FE/`, cấu hình CI/CD, biến môi trường, bảo mật,
> hiệu năng, khả năng truy cập và giao diện desktop/tablet/mobile.

## 1. Kết luận điều hành

AP Post hiện là một hệ thống giao nhận full-stack có nền tảng tốt: Angular 20,
NestJS 11, MongoDB, phân quyền bốn vai trò, tạo đơn B2B/B2C, tính cước, tracking,
thanh toán, email, thông báo thời gian thực, i18n, điều phối Shipper và dashboard. Sau vòng nâng cấp này,
project đã build production thành công, toàn bộ test hiện có đều qua và audit
dependency production không phát hiện lỗ hổng.

Mã nguồn hiện **đủ điều kiện đưa lên staging**. Chưa nên tuyên bố “production hoàn
hảo” trước khi hoàn tất các hạng mục vận hành bên ngoài source code: cấu hình secret
thật, kiểm thử sandbox/live của cổng thanh toán, SMTP, backup/restore MongoDB,
monitoring và smoke test trên chính domain production.

Quy ước:

- ✅ Có và đã hoạt động trong source code.
- 🟡 Có một phần hoặc cần cấu hình dịch vụ ngoài.
- ❌ Chưa có, được đưa vào backlog rõ ràng.

## 2. Kiến trúc và nền tảng đã có

| Khu vực      | Hiện trạng                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| Frontend     | ✅ Angular 20 standalone components, lazy routes, RxJS, Bootstrap 5, Iconify, SweetAlert2, Chart.js, Leaflet         |
| Backend      | ✅ NestJS 11, REST API version `v1`, MongoDB/Mongoose, Socket.IO                                                     |
| Xác thực     | ✅ Local login, access token + refresh token xoay vòng, refresh cookie `httpOnly`, logout thu hồi token              |
| Phân quyền   | ✅ `ADMIN`, `STAFF`, `USER`, `SHIPPER`; guard ở cả frontend và backend                                               |
| Dữ liệu      | ✅ MongoDB schemas, validation DTO, soft delete, các index truy vấn chính                                            |
| API docs     | ✅ Swagger ngoài production, tắt mặc định trên production                                                            |
| CI/CD        | ✅ GitHub Actions kiểm tra backend/frontend; workflow triển khai Render và Vercel                                    |
| Web app      | ✅ Responsive UI, manifest, service worker production, SEO cơ bản, trang 404                                         |
| Bảo mật HTTP | ✅ Helmet, CORS allowlist, rate limit, validation whitelist, response filter, compression, security headers frontend |

## 3. Toàn bộ chức năng đã có

### 3.1. Website công khai

| Chức năng                    | Trạng thái | Ghi chú                                                                                        |
| ---------------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| Trang chủ giới thiệu dịch vụ | ✅         | Hero, lợi ích, quy trình, số liệu, CTA rõ ràng                                                 |
| Tra cứu vận đơn công khai    | ✅         | Tìm theo mã vận đơn, timeline trạng thái                                                       |
| Tính cước công khai          | ✅         | Tuyến, dịch vụ, trọng lượng và COD                                                             |
| Gửi hàng không cần tài khoản | ✅         | Route `/ship`, biểu mẫu đầy đủ, lấy tại nhà hoặc gửi tại bưu cục                               |
| OTP tạo đơn B2C              | ✅         | Gửi qua email, ràng buộc cả email và số điện thoại, cooldown, giới hạn lượt, mã/token được băm |
| Theo dõi sau khi tạo đơn     | ✅         | Điều hướng thẳng đến `/tracking?q=<waybill>`                                                   |
| SEO kỹ thuật cơ bản          | ✅         | Title, description, Open Graph, canonical, robots và sitemap                                   |
| Trang không tìm thấy         | ✅         | Trang 404 có hành động quay lại/tracking                                                       |
| Cài đặt như web app          | ✅         | Manifest + service worker; cache app shell/tài nguyên tĩnh                                     |

### 3.2. Tài khoản và bảo mật

| Chức năng                      | Trạng thái | Ghi chú                                                                |
| ------------------------------ | ---------- | ---------------------------------------------------------------------- |
| Đăng ký và kích hoạt email     | ✅         | Mã 6 ký tự, hết hạn sau 30 phút, chỉ lưu HMAC trong DB                 |
| Đăng nhập theo vai trò         | ✅         | Chuyển đúng dashboard admin/staff/customer                             |
| Quên/đặt lại mật khẩu          | ✅         | Chống dò email, mã hết hạn 15 phút, xóa refresh token sau đổi mật khẩu |
| Tự làm mới phiên               | ✅         | Interceptor chỉ chạy một refresh request rồi retry các request bị 401  |
| Điều hướng `returnUrl` an toàn | ✅         | Chặn URL ngoài domain/open redirect                                    |
| Hồ sơ cá nhân                  | ✅         | Xem và cập nhật các trường được phép                                   |
| Guard route theo vai trò       | ✅         | Chặn customer vào employee và ngược lại                                |
| Rate limit endpoint nhạy cảm   | ✅         | Login, OTP, reset, refresh và API chung                                |
| Hash mật khẩu/token/code       | ✅         | bcrypt cho mật khẩu, SHA-256/HMAC cho refresh token và mã xác thực     |

### 3.3. Đơn hàng và vận hành giao nhận

| Chức năng                         | Trạng thái | Ghi chú                                                              |
| --------------------------------- | ---------- | -------------------------------------------------------------------- |
| Tạo đơn admin/staff/customer      | ✅         | Tính phí server-side, snapshot bảng giá, gán kênh B2B/B2C            |
| Địa chỉ lấy/giao chuẩn hóa        | ✅         | Tỉnh/thành, phường/xã, tọa độ và bản đồ                              |
| Lấy hàng tại nhà                  | ✅         | Có phương thức pickup và khung giờ                                   |
| Danh sách/tìm kiếm/lọc/phân trang | ✅         | Theo trạng thái, ngày, giá, người nhận, số điện thoại                |
| Chi tiết/chỉnh sửa đơn            | ✅         | Kiểm tra quyền sở hữu/chi nhánh; customer chỉ sửa đơn pending        |
| In phiếu gửi A5 và QR vận đơn     | ✅         | Dữ liệu người dùng được escape trước khi ghi cửa sổ in               |
| Soft delete đơn                   | ✅         | Kiểm tra quyền và trạng thái hợp lệ                                  |
| State machine đơn hàng            | ✅         | Chỉ cho phép chuyển trạng thái hợp lệ; trạng thái cuối không thể đổi |
| Tracking tự động                  | ✅         | Tạo sự kiện khi tạo/cập nhật trạng thái, public lookup theo waybill  |
| Email theo trạng thái             | ✅         | Pending, confirmed, shipping, completed, canceled                    |
| Gắn đơn guest vào tài khoản       | ✅         | Theo email/số điện thoại khi kích hoạt tài khoản                     |
| Shipment API riêng                | ✅         | CRUD, soft delete, timeline và state machine nghiệp vụ               |
| Điều phối Shipper                 | ✅         | Phân công/hủy phân công theo role và chi nhánh; chỉ nhận đơn đã xác nhận |
| State machine giao hàng           | ✅         | Assigned, accepted, delivering, delivered, failed và retry có kiểm soát |
| Ứng dụng Shipper mobile           | ✅         | Danh sách/chi tiết, gọi, chỉ đường, GPS, POD, báo lỗi, lịch sử và hồ sơ |

### 3.4. Giá, chi nhánh và quản trị

| Chức năng                     | Trạng thái | Ghi chú                                                    |
| ----------------------------- | ---------- | ---------------------------------------------------------- |
| Bảng giá theo dịch vụ/khu vực | ✅         | Giá cơ bản, quá cân, nội/ngoại vùng, thời gian hiệu lực    |
| Tính cước ở backend           | ✅         | Không tin giá do frontend gửi lên                          |
| Quản lý chi nhánh             | ✅         | CRUD, chi tiết, thùng rác, khôi phục, xóa vĩnh viễn        |
| Quản lý nhân viên             | ✅         | CRUD, gán chi nhánh, kích hoạt, thùng rác                  |
| Quản lý Shipper              | ✅         | Tạo tài khoản, phương tiện, chi nhánh, availability, tải công việc và điều phối |
| Dashboard admin               | ✅         | Đơn, doanh thu, trạng thái, hiệu suất nhân viên, đơn tồn   |
| Dashboard staff/customer      | ✅         | Tổng quan nhanh, danh sách đơn và thao tác theo quyền      |
| Trang hướng dẫn hỗ trợ admin  | ✅         | Tìm kiếm nội dung hướng dẫn                                |
| Seed dữ liệu phát triển       | ✅         | Chỉ cho phép ngoài production; bị chặn bằng validation env |

### 3.5. Thanh toán và thông báo

| Chức năng                      | Trạng thái | Ghi chú                                                                |
| ------------------------------ | ---------- | ---------------------------------------------------------------------- |
| Tiền mặt/COD                   | ✅         | Khởi tạo chờ thanh toán; chỉ xác nhận đơn sau khi admin/staff xác nhận đã thực thu |
| MoMo                           | 🟡         | Tạo thanh toán, IPN và return; cần credential/callback thật            |
| VNPAY                          | 🟡         | Signed Return cho local, IPN GET idempotent cho production; cần credential/callback thật |
| QR/VietQR thanh toán           | ✅ Đã gỡ   | Không còn lựa chọn, UI, API/module; có migration dữ liệu QR cũ          |
| Danh sách/cập nhật payment API | ✅         | Dành cho admin/staff                                                   |
| Thông báo realtime             | ✅         | Socket.IO theo user/email/role room                                    |
| Notification center            | ✅         | Danh sách, đọc tất cả, cập nhật, xóa mềm                               |
| Email SMTP/Handlebars          | 🟡         | Template và support contact có cấu hình; cần SMTP production           |

### 3.6. Chất lượng và production engineering

| Hạng mục                          | Trạng thái | Ghi chú                                                                    |
| --------------------------------- | ---------- | -------------------------------------------------------------------------- |
| Validate biến môi trường lúc boot | ✅         | Secret, URL HTTPS, CORS, cấu hình tích hợp theo nhóm                       |
| Health endpoint                   | ✅         | Liveness/API và MongoDB health                                             |
| Graceful shutdown                 | ✅         | Nest shutdown hooks                                                        |
| Reverse proxy/compression         | ✅         | `trust proxy` và gzip/brotli qua middleware/proxy                          |
| Runtime API config frontend       | ✅         | Có thể đổi `apiBaseUrl` trong `runtime-config.js` không cần rebuild        |
| MongoDB index production          | ✅         | Có script `npm run db:indexes`; không tự tạo index khi app boot production |
| Unit tests                        | ✅         | Backend 45 test, frontend 11 test tại thời điểm báo cáo                    |
| Production build                  | ✅         | Backend và frontend build thành công                                       |
| Dependency audit production       | ✅         | 0 lỗ hổng production tại thời điểm báo cáo                                 |

`npm audit` đầy đủ của frontend còn báo 3 cảnh báo mức moderate trong chuỗi phụ
thuộc **dev-only** của Angular CLI (`@modelcontextprotocol/sdk` →
`@hono/node-server`). Các package này không nằm trong bundle production; npm hiện
chỉ đề xuất đổi major Angular CLI nên chưa áp dụng một bản sửa phá vỡ tương thích.

## 4. Nâng cấp đã thực hiện trong vòng rà soát này

- Mở luồng gửi hàng B2C thực sự ở `/ship`, thêm OTP email và giao diện ba bước.
- Băm OTP/token public và mã kích hoạt/reset; giảm thời gian tồn tại mã.
- Hoàn thiện refresh session tự động và sửa phân quyền route frontend.
- Thêm state machine cho order và shipment, validate enum ở controller.
- Chặn nhân viên truy cập/cập nhật đơn ngoài phạm vi chi nhánh.
- Gỡ toàn bộ thanh toán QR/VietQR và bổ sung migration cho dữ liệu lịch sử.
- Chuẩn hóa VNPAY local/production theo signed Return và IPN GET; khóa mọi đường xác nhận đơn chưa có payment `paid`.
- Bổ sung role `SHIPPER`, quản lý/điều phối theo chi nhánh và ứng dụng giao hàng mobile-first có GPS/POD/retry.
- Bổ sung đa ngôn ngữ Việt/Anh cho public, auth, dashboard, thanh toán và Shipper.
- Sửa URL tracking trong email và chuẩn hóa thông tin hỗ trợ bằng env.
- Sửa lại phép tính tài chính khi chỉnh sửa đơn, kể cả COD bằng `0`.
- Thêm index cho dashboard, order, payment, notification, user và TTL OTP.
- Thêm runtime config, 404, SEO, security headers, manifest và service worker.
- Cache geocoding phía client 10 phút, bỏ `User-Agent` giả mà browser không được phép đặt.
- Gỡ cổng thanh toán giả, EJS, auth demo stateful/stateless và các hàm frontend gọi API không tồn tại.
- Dọn asset/template cũ, inline icon, code server-side rendering không sử dụng.
- Bổ sung test cấu hình production và role guard.

## 5. Rà soát giao diện theo ba nhóm thiết bị

| Thiết bị           | Mục tiêu                                                     | Kết quả                                                                                 |
| ------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Desktop ≥ 1200 px  | Hero rộng, dashboard có sidebar, form hai cột, bảng đầy đủ   | ✅ Khoảng trắng, hierarchy, CTA và trạng thái rõ; form gửi hàng dùng hai cột hợp lý     |
| Tablet 768–1199 px | Không tràn ngang, form một cột, nav/sidebar thích nghi       | ✅ Grid co về một cột; ba bước, OTP và summary vẫn đọc tốt; vùng chạm đủ lớn            |
| Mobile 360–767 px  | Ưu tiên tác vụ chính, nút full-width, bảng/card cuộn an toàn | ✅ Header/form/OTP xếp dọc, font và input phù hợp, bảng có wrapper, CTA không chồng lấn |

Các tiêu chuẩn giao diện áp dụng toàn cục: màu thương hiệu nhất quán, focus-visible,
label gắn với input, trạng thái loading/empty/error, nút có `type`, icon có nhãn truy
cập, giảm chuyển động theo `prefers-reduced-motion`, tương phản chữ và responsive
breakpoint tại mobile/tablet/desktop.

## 6. Những gì chưa có hoặc chưa thể hoàn tất chỉ bằng source code

### P0 — phải hoàn tất trước go-live

| Hạng mục chưa có                             | Rủi ro                                             | Hành động đề nghị                                                                         |
| -------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Staging E2E với MongoDB/SMTP/payment sandbox | Luồng thật có thể sai dù unit test xanh            | Chạy kịch bản đăng ký → tạo đơn → thanh toán → IPN → tracking → email trên domain staging |
| Backup và diễn tập restore MongoDB           | Mất dữ liệu khi thao tác/vận hành lỗi              | Bật Atlas PITR/daily snapshot, retention và diễn tập restore định kỳ                      |
| Error tracking, metrics và alert             | Không phát hiện lỗi/chậm sau deploy                | Tích hợp Sentry/OpenTelemetry + log aggregation + uptime/latency alert                    |
| Object storage cho upload                    | Disk local của Render không bền vững               | Chuyển upload sang S3/R2/Cloudinary, kiểm tra MIME và signed URL                          |
| Transaction cho toàn bộ luồng tạo đơn        | Có thể sinh dữ liệu một phần nếu DB lỗi giữa chừng | Dùng Mongo transaction trên replica set cho address/order/tracking/payment/OTP            |
| Secret thật và callback allowlist            | Thanh toán/email không thể chạy live               | Cấu hình qua secret manager, xoay secret, đăng ký HTTPS callback với nhà cung cấp         |

### P1 — nên có ngay sau bản production đầu tiên

| Hạng mục chưa có                              | Đề nghị                                                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| E2E browser, integration test DB và load test | Playwright/Cypress + Mongo testcontainer + k6/Artillery cho auth, tracking, OTP và order     |
| Điều phối nâng cao theo tuyến/tải             | Tối ưu tuyến nhiều điểm, SLA/capacity theo ca và bản đồ điều phối thời gian thực             |
| UI quản trị Payment/Service                   | Bổ sung đối soát, hoàn tiền, export và CRUD danh mục dịch vụ                                 |
| Object storage bền vững cho Proof of Delivery | UI đã có ảnh/vị trí/tên người nhận; cần S3/R2/Cloudinary thay disk tạm của Render             |
| Quy trình hoàn/đổi/hoàn tiền                  | Tạo state machine và audit log riêng cho return/refund                                       |
| Nhà cung cấp SMS/push                         | Gắn adapter thật; enum hiện có nhưng chưa có SMS/push delivery provider                      |
| Geocoding có SLA                              | Proxy/cache server-side hoặc Google Maps/Mapbox/Here; Nominatim public không phù hợp tải lớn |
| Audit log bất biến                            | Ghi lại ai đổi tiền, trạng thái, chi nhánh và quyền ở mức sự kiện                            |
| Privacy workflow                              | Export/xóa tài khoản, retention policy, consent và tài liệu bảo vệ dữ liệu                   |
| Thu hẹp CSP theo domain deploy                | Thay nguồn `https:` rộng bằng allowlist API, map, QR và payment thực tế                      |

### P2 — nâng cấp sản phẩm

- Bổ sung thêm locale ngoài Việt/Anh và hoàn thiện định dạng theo locale cho báo cáo chuyên sâu.
- Branch finder công khai và lịch lấy hàng có năng lực điều phối thực tế.
- Xuất CSV/XLSX, hóa đơn/nhãn PDF và barcode nội bộ thay vì dịch vụ QR ngoài.
- Analytics sản phẩm, funnel tạo đơn và A/B testing có consent.
- Offline read-only sâu hơn; hiện service worker không cho phép tạo đơn offline.
- Bộ kiểm thử accessibility tự động bằng axe và kiểm thử bàn phím/screen reader thủ công.

## 7. Checklist triển khai production

1. Tạo MongoDB Atlas replica set, user ít quyền nhất và network allowlist.
2. Đặt toàn bộ biến trong `BE/.env.example`; tất cả URL/CORS production phải HTTPS.
3. Chạy `npm ci && npm run check && npm run db:indexes` trong `BE/` trước khi mở traffic.
4. Cấu hình SMTP, support contact, MoMo/VNPAY; đăng ký VNPAY Return URL và IPN GET HTTPS công khai.
5. Ghi `window.__AP_POST_CONFIG__ = { apiBaseUrl: 'https://api-domain/api/v1' };`
   vào file `/runtime-config.js` của deployment frontend.
6. Build frontend bằng `npm ci && npm run build`; kiểm tra có `ngsw.json` và
   `ngsw-worker.js` trong output.
7. Xác nhận CORS HTTP/WebSocket chỉ chứa domain thực; kiểm tra refresh cookie trên trình duyệt.
8. Chạy smoke test desktop, tablet, mobile và toàn bộ payment callback trên staging.
9. Bật backup, uptime monitor, error tracking, log retention và cảnh báo.
10. Chỉ chuyển traffic production sau khi có kế hoạch rollback và người trực sự cố.

## 8. Lệnh xác minh trước mỗi lần phát hành

```bash
# Backend
cd BE
npm ci
npm run format:check
npm run check
npm audit --omit=dev --audit-level=high

# Frontend
cd FE
npm ci
npm run i18n:audit
npm run build
npm run test:ci
npm audit --omit=dev --audit-level=high
```

## 9. Tiêu chí go/no-go

- **Code:** GO — build, lint và test hiện có đều xanh.
- **Staging:** CONDITIONAL — cần chạy E2E với dịch vụ thật/sandbox.
- **Production:** NO-GO cho đến khi hoàn tất toàn bộ P0 thuộc hạ tầng/vận hành.

Báo cáo này cố ý phân biệt “source code sẵn sàng” với “hệ thống production đã được
vận hành an toàn”. Không có dự án nào đạt production hoàn hảo chỉ bằng việc build
thành công; backup, quan sát, kiểm thử callback và diễn tập sự cố là điều kiện bắt buộc.
