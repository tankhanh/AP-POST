import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PricingService } from '../../../services/dashboard/pricing.service';

@Component({
  selector: 'app-list-pricing',
  templateUrl: './listPricing.html',
  standalone: true,
  imports: [CommonModule, FormsModule],
})
export class ListPricing implements OnInit {
  prices: any[] = [];
  filteredPrices: any[] = [];

  expandedId: string | null = null;

  filters = {
    isActive: '',
    minPrice: null as number | null,
    maxPrice: null as number | null,
    search: '',
  };

  currentPage = 1;
  pageSize = 10;

  constructor(private pricingService: PricingService) {}

  ngOnInit() {
    this.loadPricing();
  }

  loadPricing() {
    this.pricingService.getAll().subscribe({
      next: (res) => {
        this.prices = res?.data?.results || [];

        this.applyFilters();
      },
      error: (err) => {
        console.error('Failed to load pricing:', err);
        this.prices = [];
        this.applyFilters();
      },
    });
  }
  applyFilters() {
    let results = [...this.prices];

    if (this.filters.isActive !== '') {
      results = results.filter((p) => p.isActive === (this.filters.isActive === 'true'));
    }

    if (this.filters.minPrice != null) {
      results = results.filter((p) => p.basePrice >= this.filters.minPrice!);
    }

    if (this.filters.maxPrice != null) {
      results = results.filter((p) => p.basePrice <= this.filters.maxPrice!);
    }

    if (this.filters.search.trim() !== '') {
      const s = this.filters.search.toLowerCase();
      results = results.filter(
        (p) =>
          (p.serviceId?.name || '').toLowerCase().includes(s) ||
          (p._id || '').toLowerCase().includes(s),
      );
    }

    this.filteredPrices = results;
    this.currentPage = 1;
  }

  pagedPrices() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredPrices.slice(start, start + this.pageSize);
  }

  totalPages() {
    const count = Math.ceil(this.filteredPrices.length / this.pageSize);
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  changePage(p: number) {
    if (p < 1 || p > this.totalPages().length) return;
    this.currentPage = p;
  }

  toggleExpand(id: string) {
    this.expandedId = this.expandedId === id ? null : id;
  }
}
