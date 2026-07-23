// branch-detail.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BranchService } from '../../services/branch.service';
import { DatePipe } from '@angular/common'; // 👈 import DatePipe

@Component({
  selector: 'app-branch-detail',
  standalone: true, // 👈 nếu project đang dùng standalone
  templateUrl: './branch-detail.component.html',
  imports: [DatePipe], // 👈 thêm DatePipe vào đây
})
export class BranchDetailComponent implements OnInit {
  branch: any;
  isLoading = false;
  error: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private branchService: BranchService,
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error = 'Không tìm thấy ID chi nhánh';
      return;
    }

    this.isLoading = true;
    try {
      this.branch = await this.branchService.findById(id);
    } catch (err) {
      console.error(err);
      this.error = 'Không tải được thông tin chi nhánh';
    } finally {
      this.isLoading = false;
    }
  }

  backToList() {
    this.router.navigate(['/admin/branch']);
  }
}
