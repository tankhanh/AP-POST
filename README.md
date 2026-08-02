# AP Post

AP Post là nền tảng quản lý giao nhận và vận hành bưu kiện, được xây dựng để kết nối khách hàng, nhân viên, quản trị viên và shipper trong một quy trình thống nhất. Dự án hướng đến trải nghiệm gửi hàng nhanh, theo dõi minh bạch và quản lý vận hành tập trung trên cả máy tính lẫn thiết bị di động.

## Tổng quan

Hệ thống gồm hai phần chính:

- **Frontend:** Angular 20, Bootstrap 5, Chart.js, Leaflet và Three.js.
- **Backend:** NestJS 11, MongoDB, Mongoose, Socket.IO và JWT.

Giao diện hỗ trợ tiếng Việt và tiếng Anh, thiết kế responsive, validation biểu mẫu, định dạng tiền tệ và các luồng riêng theo từng vai trò.

## AP Post đáp ứng được gì?

### Dành cho khách hàng

- Tạo và quản lý đơn giao hàng.
- Tra cứu trạng thái đơn bằng mã vận đơn.
- Ước tính cước phí trước khi gửi.
- Theo dõi hành trình giao nhận.
- Đăng ký, đăng nhập, xác minh và khôi phục mật khẩu.
- Thanh toán qua các cổng tích hợp như MoMo và VNPAY.

### Dành cho nhân viên vận hành

- Tạo, cập nhật và quản lý danh sách đơn hàng.
- Theo dõi trạng thái xử lý và tiến trình giao nhận.
- Tra cứu bảng giá, chi nhánh và thông tin liên quan.
- In thông tin đơn hàng phục vụ vận hành.

### Dành cho quản trị viên

- Theo dõi dashboard, doanh thu và chỉ số vận hành.
- Quản lý đơn hàng, nhân viên, shipper và chi nhánh.
- Cấu hình dịch vụ, bảng giá và chính sách tính cước.
- Theo dõi đơn chậm, đơn hủy/hoàn và hiệu suất giao hàng.

### Dành cho shipper

- Nhận và theo dõi công việc được phân công.
- Xem chi tiết điểm lấy hàng và giao hàng.
- Cập nhật trạng thái trong quá trình vận chuyển.
- Xem lịch sử giao hàng và quản lý hồ sơ cá nhân.

### Nền tảng kỹ thuật

- Phân quyền truy cập theo vai trò bằng guard và JWT.
- Cập nhật thời gian thực bằng WebSocket/Socket.IO.
- Bản đồ và định tuyến giao nhận bằng Leaflet.
- Giao diện trực quan Three.js trên trang chủ.
- API có validation, rate limiting, bảo mật HTTP và health check.
- Service worker hỗ trợ khả năng vận hành theo hướng PWA.
- CI tự động kiểm tra frontend và backend trước khi triển khai.

## Cấu trúc dự án

```text
AP-POST/
├── FE/                 # Ứng dụng Angular
├── BE/                 # API NestJS và MongoDB
├── .github/workflows/  # CI và quy trình triển khai
└── README.md           # Tài liệu tổng quan duy nhất được công khai
```

## Yêu cầu môi trường

- Node.js 20.19 trở lên.
- npm 10 trở lên.
- MongoDB 7 hoặc MongoDB Atlas.

## Khởi chạy dự án

### 1. Backend

```bash
cd BE
cp .env.example .env
npm ci
npm run dev
```

Cập nhật các biến môi trường trong `BE/.env` trước khi chạy. Backend mặc định phục vụ API tại `http://localhost:8000/api/v1`. Swagger có thể được bật ở môi trường phát triển tại `http://localhost:8000/docs`.

### 2. Frontend

Mở terminal khác:

```bash
cd FE
npm ci
npm start
```

Frontend mặc định chạy tại `http://localhost:4200`.

Có thể cấu hình API khi triển khai bằng `runtime-config.js`:

```js
window.__AP_POST_CONFIG__ = {
  apiBaseUrl: 'https://api.example.com/api/v1',
};
```

## Kiểm tra chất lượng

```bash
# Backend
cd BE
npm run check

# Frontend
cd FE
npm run build
npm run test:ci
npm run i18n:audit
```

## Biến môi trường và bảo mật

Các file `.env` không được commit. Chỉ `BE/.env.example` được lưu trong repository để mô tả cấu hình cần thiết, bao gồm:

- MongoDB và JWT.
- SMTP/Brevo phục vụ email xác minh.
- MoMo và VNPAY.
- CORS cho HTTP và WebSocket.
- Cấu hình môi trường production.

Không đưa secret, khóa riêng, chứng thư, dữ liệu database, log hoặc nội dung upload runtime lên GitHub.

## Định hướng phát triển

Trong các phiên bản tiếp theo, AP Post dự kiến tập trung vào:

- Tối ưu tuyến giao hàng dựa trên vị trí, tải trọng và thời gian thực.
- Nâng cấp theo dõi bản đồ trực tiếp và dự báo thời gian giao dự kiến.
- Hoàn thiện PWA, thông báo đẩy và trải nghiệm offline có kiểm soát.
- Mở rộng báo cáo vận hành, đối soát COD và phân tích hiệu suất.
- Bổ sung kiểm thử end-to-end và kiểm thử tải cho các luồng quan trọng.
- Tăng cường quan sát hệ thống bằng logging tập trung, metrics và cảnh báo.
- Chuẩn hóa quy trình triển khai container, staging và rollback.
- Nâng cao khả năng tiếp cận, hiệu năng và trải nghiệm trên thiết bị cấu hình thấp.

## Chính sách file Git

Repository chỉ theo dõi mã nguồn, lockfile, workflow CI/CD, tài nguyên công khai và file cấu hình mẫu an toàn. File sinh ra khi build, dependency, cache, log, biến môi trường, secret, dữ liệu cục bộ và tài liệu Markdown nội bộ đều bị bỏ qua. `README.md` ở thư mục gốc là file Markdown duy nhất được công khai trên GitHub.
