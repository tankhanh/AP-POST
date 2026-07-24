# Báo cáo sửa lỗi & tối ưu luồng đăng ký tài khoản

## Tổng quan

Đã kiểm tra toàn bộ luồng đăng ký tài khoản từ Frontend (Angular) đến Backend (NestJS) và phát hiện **6 vấn đề** (1 bug, 3 lỗi logic, 2 thiếu sót UX). Tất cả đã được sửa.

---

## Chi tiết các lỗi đã sửa

### 1. Email template: Sai thời gian hiệu lực (5 phút → 30 phút)
- **File:** `BE/src/modules/mail/templates/register.hbs`
- **Vấn đề:** Template ghi *"This code is valid for the next 5 minutes"* nhưng backend thực tế set `codeExpired: dayjs().add(30, 'minute')` (30 phút).
- **Fix:** Cập nhật text → *"Mã có hiệu lực trong vòng 30 phút"* để khớp với code.
- **Bổ sung:** Cải thiện toàn bộ template:
  - Chuyển từ tiếng Anh sang tiếng Việt
  - Thêm branding **AP Post** rõ ràng
  - Thiết kế lại layout với `code-box` trực quan hơn
  - Thêm thông tin hỗ trợ ở footer

### 2. Password minlength không đồng bộ FE/BE
- **File:** `FE/src/app/account/register/register.html`
- **Vấn đề:** FE cho phép `minlength="6"` nhưng BE yêu cầu `@MinLength(8)`.
- **Fix:** Đồng bộ lên `minlength="8"` ở FE, cập nhật placeholder text tương ứng.

### 3. Sai kiểu dữ liệu phone & thiếu validation
- **File:** `BE/src/modules/users/dto/create-user.dto.ts`
- **Vấn đề:** `RegisterUserDto.phone` khai báo `phone?: number` nhưng FE gửi string → lỗi tiềm ẩn khi transform.
- **Fix:**
  - Đổi `phone?: number` → `phone?: string`
  - Thêm decorator `@Matches(/^[0-9]{9,15}$/)` để validate format số điện thoại

### 4. Thiếu kiểm tra phone trùng khi đăng ký
- **File:** `BE/src/modules/users/users.service.ts` — hàm `register()`
- **Vấn đề:** Chỉ kiểm tra email đã tồn tại, không check phone → nhiều user có thể đăng ký cùng số điện thoại.
- **Fix:** Thêm logic kiểm tra `phone` đã tồn tại trong database trước khi tạo user mới.

### 5. Thiếu nút "Gửi lại mã xác nhận" ở trang Verify
- **File:** 
  - `FE/src/app/account/verify/verify.ts` — mới
  - `FE/src/app/account/verify/verify.html` — mới
  - `FE/src/app/services/auth.service.ts` — mới
  - `FE/src/app/account/register/register.ts` — sửa
- **Vấn đề:** Trang `/verify` chỉ có form nhập code, không có cách nào để yêu cầu gửi lại mã nếu không nhận được email.
- **Fix:** 
  - Thêm method `resendVerificationCode()` trong `AuthService`
  - Lưu email vào `sessionStorage` khi đăng ký
  - Thêm nút "Gửi lại mã xác nhận" ở trang verify với loading spinner
  - Hiển thị thông báo thành công/thất bại

### 6. Cải thiện email template Registration
- **File:** `BE/src/modules/mail/templates/register.hbs`
- Đã cập nhật template chuyên nghiệp hơn với branding **AP Post** hoàn chỉnh.

---

## Danh sách file đã thay đổi

| File | Loại thay đổi |
|------|---------------|
| `BE/src/modules/mail/templates/register.hbs` | Sửa nội dung + thiết kế lại |
| `FE/src/app/account/register/register.html` | Sửa minlength |
| `BE/src/modules/users/dto/create-user.dto.ts` | Sửa type phone + thêm validation |
| `BE/src/modules/users/users.service.ts` | Thêm check duplicate phone |
| `FE/src/app/account/verify/verify.ts` | Thêm method retryCode + Toastr |
| `FE/src/app/account/verify/verify.html` | Thêm UI nút gửi lại mã |
| `FE/src/app/services/auth.service.ts` | Thêm method resendVerificationCode |
| `FE/src/app/account/register/register.ts` | Lưu email vào sessionStorage |

---

## Luồng đăng ký sau khi sửa

1. User nhập **name, phone, email, password (≥8 ký tự)** + đồng ý điều khoản
2. Validate phone format (9-15 số) + check duplicate phone & email ở BE
3. Tạo user với `isActive: false`, gửi email kích hoạt (template tiếng Việt, 30 phút)
4. Chuyển hướng đến `/verify` với `pending_user_id` + `pending_user_email` trong storage
5. User nhập mã → gọi `/auth/check-code` → kích hoạt tài khoản
6. Nếu không nhận được mã → bấm **"Gửi lại mã xác nhận"** → gọi `/auth/retry-active`
7. Sau khi kích hoạt → chuyển đến `/login` để đăng nhập

