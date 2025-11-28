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

declare global {
  interface Window {
    L: any;
  }
}

@Component({
  selector: 'app-map-picker',
  standalone: true,
  templateUrl: './map-picker.html',
})
export class MapPickerComponent implements AfterViewInit {
  // SỬA CHỖ NÀY: static: true
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;

  @Output() locationSelect = new EventEmitter<{ lat: number; lng: number }>();

  private map: any;
  private marker: any;

  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

  async ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    const L = await import('leaflet');
    (window as any).L = L; // cực kỳ quan trọng

    this.map = L.map(this.mapContainer.nativeElement).setView([10.76, 106.66], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);

    this.map.on('click', (e: any) => {
      const { lat, lng } = e.latlng;
      this.setMarker(lat, lng);
      this.locationSelect.emit({ lat, lng });
    });

    this.setMarker(10.76, 106.66);
  }

  setMarker(lat: number, lng: number) {
    if (this.marker) this.marker.remove();
    if (!this.map) return; // bảo vệ

    const L = (window as any).L;

    const icon = L.divIcon({
      className: 'custom-marker',
      html: `<iconify-icon icon="mdi:map-marker" width="40" height="40" style="color:#e74c3c; filter: drop-shadow(3px 3px 3px rgba(0,0,0,0.4));"></iconify-icon>`,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
    });

    this.marker = L.marker([lat, lng], { icon }).addTo(this.map);
    this.map.setView([lat, lng], 15);
  }
}