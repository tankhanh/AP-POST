import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BranchService } from '../../services/branch.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-branch-trash',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './branch-trash.component.html',
})
export class BranchTrashComponent implements OnInit {
  branches: any[] = [];
  isLoading = false;

  constructor(
    private branchService: BranchService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.loadTrash();
  }

  loadTrash() {
    this.isLoading = true;

    this.branchService
      .findTrash()
      .then((branches: any[]) => {
        this.branches = branches;
        this.isLoading = false;
      })
      .catch((err) => {
        this.isLoading = false;
        this.toastr.error('Không tải được thùng rác chi nhánh');
        console.error(err);
      });
  }

  async restore(id: string) {
    const result = await Swal.fire({
      title: 'Khôi phục chi nhánh?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Khôi phục',
      cancelButtonText: 'Hủy',
    });
    if (!result.isConfirmed) return;

    this.isLoading = true;
    this.branchService
      .restore(id)
      .then(() => {
        this.toastr.success('Đã khôi phục chi nhánh');
        this.loadTrash();
      })
      .catch((err) => {
        this.isLoading = false;
        this.toastr.error('Khôi phục thất bại');
        console.error(err);
      });
  }

  async hardDelete(id: string) {
    const result = await Swal.fire({
      title: 'Xóa vĩnh viễn chi nhánh?',
      text: 'Dữ liệu sẽ không thể khôi phục.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Xóa vĩnh viễn',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#d03238',
    });
    if (!result.isConfirmed) return;

    this.isLoading = true;
    this.branchService
      .hardDelete(id)
      .then(() => {
        this.toastr.success('Đã xoá vĩnh viễn chi nhánh');
        this.loadTrash();
      })
      .catch((err) => {
        this.isLoading = false;
        this.toastr.error('Xoá vĩnh viễn thất bại');
        console.error(err);
      });
  }
}
