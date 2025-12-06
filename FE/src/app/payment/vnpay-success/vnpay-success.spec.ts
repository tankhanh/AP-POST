import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VnpaySuccess } from './vnpay-success';

describe('VnpaySuccess', () => {
  let component: VnpaySuccess;
  let fixture: ComponentFixture<VnpaySuccess>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VnpaySuccess]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VnpaySuccess);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
