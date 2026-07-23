import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { env } from '../environments/environment';
import { ShipperService } from './shipper.service';

describe('ShipperService', () => {
  let service: ShipperService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ShipperService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests a paginated shipper job view and unwraps the response', () => {
    let total = 0;
    service.getJobs('failed', 'BD123', 2, 10).subscribe((page) => (total = page.meta.total));

    const request = http.expectOne(
      (candidate) => candidate.url === `${env.baseUrl}/orders/shipper/jobs`,
    );
    expect(request.request.params.get('view')).toBe('failed');
    expect(request.request.params.get('search')).toBe('BD123');
    expect(request.request.params.get('current')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('10');
    request.flush({
      data: { meta: { current: 2, pageSize: 10, pages: 3, total: 21 }, results: [] },
    });

    expect(total).toBe(21);
  });

  it('loads only the assigned job detail', () => {
    let waybill = '';
    service.getJob('507f1f77bcf86cd799439011').subscribe((job) => (waybill = job.waybill));

    const request = http.expectOne(`${env.baseUrl}/orders/507f1f77bcf86cd799439011`);
    expect(request.request.method).toBe('GET');
    request.flush({ data: { _id: '507f1f77bcf86cd799439011', waybill: 'BD123456789VN' } });

    expect(waybill).toBe('BD123456789VN');
  });

  it('uses the explicit retry transition endpoint', () => {
    service.retry('507f1f77bcf86cd799439011').subscribe();

    const request = http.expectOne(`${env.baseUrl}/orders/507f1f77bcf86cd799439011/shipper/retry`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({});
    request.flush({ data: { deliveryState: 'DELIVERING' } });
  });

  it('requests automatic assignment for one order', () => {
    let assigned = false;
    service
      .autoAssign('507f1f77bcf86cd799439011')
      .subscribe((result) => (assigned = result.assigned));

    const request = http.expectOne(
      `${env.baseUrl}/orders/507f1f77bcf86cd799439011/auto-assign-shipper`,
    );
    expect(request.request.method).toBe('PATCH');
    request.flush({ data: { assigned: true, shipperId: 'shipper-1' } });
    expect(assigned).toBe(true);
  });

  it('requests automatic assignment for the dispatch queue', () => {
    let processed = 0;
    service.autoAssignQueue().subscribe((result) => (processed = result.processed));

    const request = http.expectOne(`${env.baseUrl}/orders/dispatch/auto-assign`);
    expect(request.request.method).toBe('PATCH');
    request.flush({ data: { processed: 3, assigned: 2, pending: 1, results: [] } });
    expect(processed).toBe(3);
  });
});
