import {
  Component,
  Inject,
  PLATFORM_ID,
  AfterViewInit,
  ViewChild,
  ElementRef,
  Output,
  EventEmitter,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-map-picker',
  standalone: true,
  templateUrl: './map-picker.html',
})
export class MapPickerComponent implements AfterViewInit {
  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;
  @Output() locationSelect = new EventEmitter<{ lat: number; lng: number }>();

  private map: any;
  private marker: any;
  private L: any; // ← khai báo để dùng chung

  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

  async ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.mapContainer) return;

    // Load Leaflet động
    this.L = await import('leaflet');

    // Fix icon mặc định (dù bạn không dùng nhưng cần để tránh lỗi)
    delete (this.L.Icon.Default.prototype as any)._getIconUrl;
    this.L.Icon.Default.mergeOptions({
      iconRetinaUrl: '/images/marker-icon-2x.png',
      iconUrl: '/images/marker-icon.png',
      shadowUrl: '/images/marker-shadow.png',
    });

    // Khởi tạo map
    this.map = this.L.map(this.mapContainer.nativeElement).setView([10.76, 106.66], 13);

    this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(this.map);

    // Click để chọn vị trí
    this.map.on('click', (e: any) => {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      this.setMarker(lat, lng);
      this.locationSelect.emit({ lat, lng });
    });

    // Tự động chọn vị trí trung tâm lần đầu (tùy chọn)
    this.setMarker(10.76, 106.66);
  }

  setMarker(lat: number, lng: number) {
    if (this.marker) this.marker.remove();

    // Dùng chính this.L thay vì window.L
    const icon = this.L.divIcon({
      className: 'custom-div-icon',
      html: `<iconify-icon icon="mdi:map-marker" width="40" height="40" style="color:#e74c3c; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));"></iconify-icon>`,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
    });

    this.marker = this.L.marker([lat, lng], { icon }).addTo(this.map);
    this.map.setView([lat, lng], 15);
  }
}