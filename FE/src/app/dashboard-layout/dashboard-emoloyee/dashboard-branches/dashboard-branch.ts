import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { BranchService } from '../../../services/branch.service';

@Component({
  selector: 'app-branch-list',
  templateUrl: './dashboard-branch.html',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ListBranch implements OnInit {
  branches: any[] = [];
  filteredBranches: any[] = [];

  expandedId: string | null = null;

  // Filters
  filters = {
    isActive: '',
    search: '',
  };

  // Pagination
  currentPage = 1;
  pageSize = 10;

  constructor(private branchService: BranchService) {}

  ngOnInit() {
    this.loadBranches();
  }

  // LOAD DATA
  loadBranches() {
    this.branchService.findAll().then((res: any) => {
      this.branches = res?.data?.results || res?.results || [];
      this.applyFilters();
    });
  }

  // FILTERS
  applyFilters() {
    let results = [...this.branches];

    // Trạng thái
    if (this.filters.isActive !== '') {
      results = results.filter((b) => b.isActive === (this.filters.isActive === 'true'));
    }

    // Search
    if (this.filters.search.trim() !== '') {
      const s = this.filters.search.toLowerCase();
      results = results.filter(
        (b) =>
          b.code?.toLowerCase().includes(s) ||
          b.name?.toLowerCase().includes(s) ||
          b.address?.toLowerCase().includes(s),
      );
    }

    this.filteredBranches = results;
    this.currentPage = 1;
  }

  // PAGINATION
  pagedBranches() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredBranches.slice(start, start + this.pageSize);
  }

  totalPages() {
    const count = Math.ceil(this.filteredBranches.length / this.pageSize);
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  changePage(p: number) {
    if (p < 1 || p > this.totalPages().length) return;
    this.currentPage = p;
  }

  // EXPAND/COLLAPSE
  toggleExpand(id: string) {
    this.expandedId = this.expandedId === id ? null : id;
  }

  statusText(isActive: boolean): string {
    return isActive ? 'Hoạt động' : 'Tạm dừng';
  }

  statusClass(isActive: boolean): any {
    return {
      'badge-status': true,
      'status-completed': isActive,
      'status-pending': !isActive,
    };
  }
}
