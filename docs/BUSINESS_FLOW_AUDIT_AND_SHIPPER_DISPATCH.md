# Rà soát luồng nghiệp vụ và điều phối Shipper AP Post

Ngày rà soát: 22/07/2026  
Phạm vi: backend NestJS, frontend Angular, MongoDB, thanh toán, thông báo, tracking, quản trị và ứng dụng mobile-first cho Shipper.

## 1. Kết luận điều hành

Hệ thống đã có một luồng chuẩn thống nhất theo `Order`; module `shipments` cũ đã được ngừng đăng ký API để không còn hai nguồn trạng thái vận đơn chạy song song. Luồng đơn hàng hiện được bảo vệ bằng hai state machine liên kết:

1. Trạng thái thương mại: `PENDING -> CONFIRMED -> SHIPPING -> COMPLETED`.
2. Trạng thái giao vận: `UNASSIGNED -> ASSIGNED -> ACCEPTED -> DELIVERING -> DELIVERED`, có nhánh `FAILED` để giao lại hoặc điều phối lại.

Điểm gây lỗi trong ảnh là các đơn lịch sử thiếu `branchId`. Lỗi đã được xử lý theo ba lớp:

- Đơn mới tự xác định bưu cục từ xã/phường, tỉnh/thành của địa chỉ lấy hàng.
- Script migration bổ sung bưu cục cho dữ liệu cũ có thể xác định chắc chắn.
- Khi phân công thủ công một đơn cũ chưa xác định được địa bàn, bưu cục của shipper được chọn trở thành phương án phục hồi có kiểm soát và được lưu lại trên đơn.

Kết quả migration tại môi trường hiện tại: quét 10 đơn thiếu bưu cục, tự phục hồi chắc chắn 5 đơn. Năm đơn còn lại không bị đoán bưu cục khi có nhiều lựa chọn; điều phối viên chỉ cần phân công thủ công lần đầu để hệ thống lưu bưu cục đúng theo shipper đã chọn.

## 2. Những gì hệ thống đã có và đã được nâng cấp

| Nhóm | Đã có | Nâng cấp trong đợt rà soát | Đánh giá |
|---|---|---|---|
| Xác thực | JWT access/refresh, khóa tài khoản, guard theo role | Kiểm tra issuer/token type; trạng thái online của shipper theo socket và heartbeat | Tốt |
| Role | Admin, Staff, User, Shipper | Cô lập dữ liệu và notification của Shipper theo đúng người được giao | Tốt |
| Tạo đơn | B2B, B2C đăng nhập, B2C khách với OTP | Tự gắn bưu cục, snapshot giá, đồng bộ lại payment khi sửa đơn chờ xác nhận | Tốt |
| Thanh toán | CASH, COD, MoMo, VNPAY | Chỉ payment `PAID` mới xác nhận đơn; gateway online chỉ callback đã xác minh mới được cập nhật | Tốt, phụ thuộc cấu hình cổng thật |
| Điều phối | Chọn shipper thủ công | Thêm điều phối tự động một đơn/toàn hàng chờ, cân bằng tải và kiểm tra phương tiện | Tốt |
| Phản hồi giao đơn | Shipper nhận đơn | Thêm từ chối, lý do, hạn phản hồi, tự hết hạn và trả về hàng chờ | Tốt |
| Tác nghiệp giao | Bắt đầu, hoàn tất | Thêm giao thất bại, giao lại, giới hạn số lần, vị trí, ảnh POD bắt buộc | Tốt |
| Tracking | Timeline theo waybill | Khóa đường xóa/khôi phục tracking khỏi API; không cho tracking bỏ qua state machine | Tốt |
| Notification | Notification DB và realtime | Shipper chỉ nhận đơn của mình; xóa thông báo cũ khi đổi/hủy/hết hạn phân công | Tốt |
| Presence | Trạng thái tài khoản | Online/offline realtime, hỗ trợ nhiều socket, TTL chống trạng thái online “ma” | Tốt |
| Giao diện quản trị | Danh sách shipper và bàn phân công | Hai chế độ điều phối, cảnh báo offline, hiển thị bưu cục/chế độ/hạn nhận | Tốt trên desktop/tablet/mobile |
| Giao diện Shipper | Danh sách và chi tiết công việc | Mobile-first, nhận/từ chối, camera POD, thất bại/giao lại, gọi điện và bản đồ | Tốt |
| Đa ngôn ngữ | VI/EN và font hỗ trợ tiếng Việt | Bộ dịch được kiểm tra đầy đủ; font Be Vietnam Pro | Tốt |
| Production | Build, test, index script, CI/PWA | Thêm index điều phối và migration bưu cục có thể chạy lặp an toàn | Sẵn sàng về mã nguồn |

## 3. Luồng đơn hàng chuẩn

### 3.1 Tạo và thanh toán

```text
Tạo đơn
  -> PENDING + Payment PENDING
  -> Payment PAID (thu ngân hoặc callback gateway hợp lệ)
  -> CONFIRMED
  -> đưa vào điều phối theo MANUAL hoặc AUTO
```

Các bất biến đã được áp dụng:

- Không thể chuyển `PENDING -> CONFIRMED` nếu không có payment `PAID`.
- Admin/Staff không thể tự đặt `SHIPPING` hoặc `COMPLETED`; hai trạng thái này chỉ đến từ tác nghiệp Shipper.
- Không thể sửa địa chỉ, cân nặng, phí, người nhận hoặc phương thức thanh toán sau khi đơn đã xác nhận.
- Không thể gửi đồng thời thay đổi dữ liệu và thay đổi trạng thái trong cùng một request.
- Không thể xóa mềm đơn đang vận hành; chỉ đơn `PENDING` hoặc `CANCELED` được xóa mềm.
- Đơn đang giao hoặc đã giao không thể bị hủy bằng đường trạng thái chung.

### 3.2 Điều phối và giao hàng

```text
UNASSIGNED
  -> ASSIGNED (đề nghị, có hạn phản hồi)
     -> ACCEPTED
        -> DELIVERING
           -> DELIVERED + Order COMPLETED + POD
           -> FAILED
              -> DELIVERING (giao lại, chưa quá giới hạn)
              -> UNASSIGNED/ASSIGNED (điều phối viên đổi người)
     -> UNASSIGNED (từ chối hoặc hết hạn)
```

`ASSIGNED` không có nghĩa shipper đã nhận. Chỉ sau `ACCEPTED` shipper mới có quyền bắt đầu giao. Đây là điểm quan trọng để tránh hệ thống ghi nhận sai tải công việc hoặc giao một đơn cho người chưa đồng ý.

## 4. Hai chế độ phân công Shipper

### 4.1 Thủ công

Điều phối viên chọn shipper cụ thể. Backend vẫn kiểm tra:

- Đơn đã `CONFIRMED` hoặc đang ở luồng `SHIPPING` cần điều phối lại.
- Shipper đúng role, đang hoạt động, không bị xóa và cho phép nhận đơn.
- Shipper có bưu cục và cùng bưu cục với đơn.
- Không được đổi shipper khi người hiện tại đã nhận và đang giao.
- Nếu shipper ngoại tuyến, giao diện yêu cầu điều phối viên xác nhận lại rủi ro.

Với dữ liệu cũ chưa có bưu cục, hệ thống thử xác định theo địa chỉ lấy hàng trước. Nếu không đủ dữ liệu, bưu cục của shipper do điều phối viên chủ động chọn được dùng làm nguồn phục hồi `MANUAL_SHIPPER_BRANCH`.

### 4.2 Tự động

Có hai cách kích hoạt:

- Tự động chọn cho một đơn.
- Tự động xử lý tối đa 100 đơn trong hàng chờ mỗi thao tác; scheduler tiếp tục thử mỗi 30 giây cho đơn ở chế độ `AUTO`.

Thứ tự lọc và xếp hạng:

1. Cùng bưu cục với đơn.
2. Tài khoản hoạt động, sẵn sàng và chưa bị xóa.
3. Trực tuyến trong cửa sổ presence TTL nếu bật `ONLINE_ONLY`.
4. Chưa đạt giới hạn số đơn đang xử lý.
5. Phương tiện đủ sức chứa theo cân nặng đơn.
6. Không phải shipper vừa từ chối hoặc để đề nghị hết hạn.
7. Ưu tiên online, ít đơn đang xử lý, sau đó người lâu chưa được giao đơn.

Tự động chỉ xử lý nền đối với `UNASSIGNED`. Đơn `FAILED` không bị tự động giao sang người khác vì lý do thất bại có thể cần hoàn trả hoặc xử lý ngoại lệ; Admin/Staff phải chủ động chọn giao lại hoặc đổi người.

Khi shipper từ chối/hết hạn một đề nghị `AUTO`, hệ thống trả đơn về `UNASSIGNED`, loại shipper vừa phản hồi khỏi vòng kế tiếp và thử người phù hợp khác. Nếu không có người phù hợp, đơn vẫn nằm an toàn trong hàng chờ, không bị gán sai.

## 5. API điều phối

| Method | Endpoint | Mục đích |
|---|---|---|
| `PATCH` | `/orders/:id/assign-shipper` | Phân công thủ công |
| `PATCH` | `/orders/:id/auto-assign-shipper` | Bật AUTO và chọn ứng viên cho một đơn |
| `PATCH` | `/orders/dispatch/auto-assign` | Tự động xử lý hàng chờ |
| `DELETE` | `/orders/:id/shipper` | Hủy phân công và chuyển về MANUAL |
| `PATCH` | `/orders/:id/shipper/accept` | Shipper nhận đề nghị |
| `PATCH` | `/orders/:id/shipper/reject` | Shipper từ chối có lý do |
| `PATCH` | `/orders/:id/shipper/start` | Bắt đầu giao |
| `PATCH` | `/orders/:id/shipper/fail` | Báo giao chưa thành công |
| `PATCH` | `/orders/:id/shipper/retry` | Giao lại trong giới hạn |
| `PATCH` | `/orders/:id/shipper/complete` | Hoàn tất với người nhận và POD |
| `PATCH` | `/orders/:id/shipper/location` | Cập nhật vị trí khi đã nhận đơn |

## 6. Cấu hình vận hành

```env
# MANUAL hoặc AUTO cho đơn mới
SHIPPER_DISPATCH_MODE=MANUAL

# Chính sách chọn shipper
SHIPPER_AUTO_ASSIGN_ONLINE_ONLY=true
SHIPPER_MAX_ACTIVE_JOBS=20
SHIPPER_PRESENCE_TTL_MS=90000
SHIPPER_ASSIGNMENT_RESPONSE_MINUTES=15

# Năng lực phương tiện
SHIPPER_MOTORBIKE_MAX_WEIGHT_KG=30
SHIPPER_CAR_MAX_WEIGHT_KG=300
SHIPPER_VAN_MAX_WEIGHT_KG=1000

# Tác nghiệp giao
SHIPPER_MAX_DELIVERY_ATTEMPTS=3
SHIPPER_REQUIRE_DELIVERY_PROOF=true
```

Khuyến nghị production: để `MANUAL` trong giai đoạn chạy thử một bưu cục, đo tỷ lệ từ chối/hết hạn trong 1–2 tuần, sau đó chuyển `AUTO` khi dữ liệu địa bàn và ca trực đã sạch.

## 7. Dữ liệu và migration

Các lệnh an toàn, có thể chạy lặp:

```bash
npm run db:indexes
npm run db:backfill-order-branches
```

`db:backfill-order-branches` chỉ cập nhật đơn chưa có `branchId`; không ghi đè đơn đã có bưu cục và không xóa dữ liệu. Tên địa bàn được chuẩn hóa để xử lý khác biệt như `Thành phố Hà Nội`/`Hà Nội`, `Phường ...`/`...`.

Module `shipments` cũ vẫn được giữ mã nguồn và collection để bảo toàn khả năng đọc/migration dữ liệu lịch sử, nhưng không còn được import vào `AppModule`, vì vậy API `/shipments` không còn là một nguồn ghi song song. Luồng production duy nhất là `/orders`.

## 8. Kiểm thử đã thực hiện

- Backend lint: đạt.
- Backend build production: đạt.
- Backend unit test: 9 suites, 51 tests đạt sau khi bổ sung policy điều phối và guard state machine.
- Frontend build production: đạt.
- Frontend unit test headless Chrome: 13 tests đạt.
- MongoDB indexes: tạo/đồng bộ thành công cho toàn bộ collection.
- Integration thật với local API và MongoDB:
  - phân công thủ công một đơn mẫu thiếu bưu cục: HTTP thành công, `branchId` được phục hồi, trạng thái thành `ASSIGNED/MANUAL`;
  - phân công tự động cùng đơn mẫu: HTTP thành công, chọn đúng ứng viên và lưu `ASSIGNED/AUTO`;
  - dữ liệu kiểm thử và notification liên quan đã được dọn sau khi xác minh.

## 9. Các hạng mục cần hạ tầng ngoài mã nguồn trước khi mở production

Đây không phải lỗi logic còn bỏ ngỏ, nhưng là điều kiện bắt buộc để vận hành thật:

| Hạng mục | Điều kiện nghiệm thu |
|---|---|
| VNPAY | Merchant production, secret production, IPN HTTPS public, đối soát callback sandbox/production |
| Email | SMTP/API key thật, SPF/DKIM/DMARC, hàng đợi gửi lại nếu lưu lượng lớn |
| Ảnh POD | Object storage/CDN production, giới hạn MIME/kích thước, chính sách lưu giữ và quyền truy cập |
| MongoDB | Replica set, backup/PITR, monitoring connection pool và chạy migration trước deploy |
| Realtime | Sticky session hoặc Socket.IO adapter dùng Redis khi chạy nhiều instance |
| Quan sát | Error tracking, structured logs, dashboard tỷ lệ AUTO thành công/từ chối/hết hạn |
| Nghiệp vụ hoàn trả | Nếu triển khai hoàn hàng vật lý đầy đủ, nên bổ sung state riêng `RETURN_REQUESTED/RETURNING/RETURNED` và đối soát COD hoàn |
| Bảo mật vận hành | Rotate toàn bộ secret, tắt init seed, kiểm tra CORS/proxy, rate limit theo hạ tầng thật |

## 10. Đánh giá readiness

- Logic đơn hàng, thanh toán và điều phối: **9/10**.
- Trải nghiệm Admin/Staff/Shipper trên mã nguồn hiện tại: **9/10**.
- Khả năng chạy production sau khi cấu hình đúng hạ tầng mục 9: **sẵn sàng staging/UAT**.
- Khả năng mở production ngay khi chưa nghiệm thu gateway, SMTP, storage, backup và multi-instance socket: **chưa nên**.

Tiêu chí go-live cuối cùng là hoàn thành UAT với ít nhất các kịch bản: thanh toán thành công/thất bại, shipper nhận/từ chối/hết hạn, mất mạng giữa phiên, giao thất bại đủ số lần, đổi shipper, hủy trước khi giao, POD upload lỗi và callback gateway gửi lặp.
