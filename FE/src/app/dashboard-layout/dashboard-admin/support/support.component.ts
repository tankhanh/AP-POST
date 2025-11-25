import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqCategory {
  title: string;
  icon?: string;
  items: FaqItem[];
}

@Component({
  selector: 'app-support',
  standalone: true,
  styleUrls: ['./support.component.scss'],
  templateUrl: './support.component.html',
  imports: [CommonModule, FormsModule],
})
export class SupportComponent {
  searchText = '';

  contactChannels = [
    {
      label: 'Hotline',
      value: '1900 9999',
      desc: 'Hỗ trợ từ 8:00 - 17:30 (T2 - T7)',
      type: 'phone',
    },
    {
      label: 'Email hỗ trợ',
      value: 'support@apppost.vn',
      desc: 'Xử lý yêu cầu trong vòng 24h',
      type: 'email',
    },
    {
      label: 'Zalo / Chat',
      value: 'ApPost Care',
      desc: 'Ưu tiên chi nhánh, cửa hàng',
      type: 'chat',
    },
  ];

  docs = [
    {
      title: 'Hướng dẫn tạo & quản lý đơn hàng',
      desc: 'Các bước tạo đơn mới, sửa đơn, huỷ đơn, xử lý đơn hoàn.',
      link: '#',
    },
    {
      title: 'Quản lý chi nhánh & bảng giá',
      desc: 'Thêm chi nhánh, cấu hình địa chỉ, phí vận chuyển, COD.',
      link: '#',
    },
    {
      title: 'Tài khoản & phân quyền nhân viên',
      desc: 'Tạo tài khoản, khoá/mở, quyền truy cập từng màn.',
      link: '#',
    },
  ];

  faqCategories: FaqCategory[] = [
    {
      title: 'Đơn hàng',
      items: [
        {
          question: 'Làm sao để tạo đơn hàng mới?',
          answer:
            'Vào menu "Đơn hàng" → "Tạo đơn". Điền đầy đủ thông tin người gửi, người nhận, dịch vụ, COD rồi bấm "Lưu".',
        },
        {
          question: 'Có thể sửa đơn sau khi đã tạo không?',
          answer:
            'Đơn ở trạng thái "Mới tạo" hoặc "Chờ lấy" có thể chỉnh sửa. Chọn đơn → "Chỉnh sửa".',
        },
      ],
    },
    {
      title: 'Chi nhánh',
      items: [
        {
          question: 'Thêm chi nhánh mới ở đâu?',
          answer:
            'Vào menu "Chi nhánh" → "Thêm mới". Điền thông tin chi nhánh, địa chỉ, khu vực phục vụ và lưu lại.',
        },
        {
          question: 'Chi nhánh có thể xem đơn của chi nhánh khác không?',
          answer:
            'Tuỳ quyền được cấp. Mặc định chỉ xem được đơn thuộc chi nhánh của mình.',
        },
      ],
    },
    {
      title: 'Nhân viên & tài khoản',
      items: [
        {
          question: 'Tạo tài khoản nhân viên như thế nào?',
          answer:
            'Vào menu "Nhân viên" → "Thêm mới". Nhập email, họ tên, chi nhánh, số điện thoại rồi lưu.',
        },
        {
          question: 'Khoá tạm thời một tài khoản nhân viên được không?',
          answer:
            'Có. Trong chi tiết nhân viên chọn "Khoá tài khoản". Nhân viên sẽ không đăng nhập được nữa.',
        },
      ],
    },
  ];

  get filteredFaqCategories(): FaqCategory[] {
    const keyword = this.searchText.trim().toLowerCase();
    if (!keyword) return this.faqCategories;

    return this.faqCategories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (i) =>
            i.question.toLowerCase().includes(keyword) ||
            i.answer.toLowerCase().includes(keyword)
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }

  sendFeedback() {
    // Phase 1 có thể chỉ show alert hoặc console.log
    alert('Cảm ơn góp ý của bạn! Bộ phận hỗ trợ sẽ ghi nhận.');
  }
}
