import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { DualMapComponent } from './app-dual-map';

describe('DualMapComponent', () => {
  let component: DualMapComponent;
  let fixture: ComponentFixture<DualMapComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DualMapComponent],
      providers: [provideHttpClient()],
    }).compileComponents();

    fixture = TestBed.createComponent(DualMapComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
