# TODO: Fix Registration Flow

## ✅ Completed Tasks

All tasks have been completed successfully! (Including: adjusted code expiry from 30→5 phút)

### 1. Email template - Sửa thời gian hiệu lực (5 phút → 30 phút) & cải thiện branding
- [x] File: `BE/src/modules/mail/templates/register.hbs`
  - Sửa "5 minutes" → "30 minutes"
  - Cập nhật branding "AP Post" thay vì "Mail"

### 2. Đồng bộ password minlength FE/BE
- [x] File: `FE/src/app/account/register/register.html`
  - Sửa `minlength="6"` → `minlength="8"`

### 3. Sửa kiểu dữ liệu phone & thêm validation
- [x] File: `BE/src/modules/users/dto/create-user.dto.ts`
  - Sửa `phone?: number` → `phone?: string`
  - Thêm `@Matches` validation cho phone

### 4. Kiểm tra duplicate phone khi đăng ký
- [x] File: `BE/src/modules/users/users.service.ts`
  - Thêm kiểm tra phone trùng trong `register()`

### 5. Thêm nút "Gửi lại mã" ở trang verify
- [x] File: `FE/src/app/account/verify/verify.ts`
  - Thêm method `retryCode()`
- [x] File: `FE/src/app/account/verify/verify.html`
  - Thêm nút gửi lại mã
- [x] File: `FE/src/app/services/auth.service.ts`
  - Thêm method `resendVerificationCode()`
- [x] File: `FE/src/app/account/register/register.ts`
  - Lưu email vào sessionStorage để dùng cho gửi lại mã

### 6. Cải thiện email template branding
- [x] File: `BE/src/modules/mail/templates/register.hbs`
  - Cập nhật đầy đủ branding AP Post

