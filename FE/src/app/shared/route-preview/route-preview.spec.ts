import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoutePreviewComponent } from './route-preview';

describe('RoutePreviewComponent', () => {
  let component: RoutePreviewComponent;
  let fixture: ComponentFixture<RoutePreviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoutePreviewComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RoutePreviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
