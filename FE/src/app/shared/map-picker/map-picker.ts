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
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;

  @Output() locationSelect = new EventEmitter<{ lat: number; lng: number }>();

  private map: any;
  private marker: any;
  private L: any;

  constructor(@Inject(PLATFORM_ID) private platformId: object) { }

  async ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    // ← DÒNG QUAN TRỌNG NHẤT: .default !!!
    const leafletModule = await import('leaflet');
    this.L = leafletModule.default;  // ← ĐÚNG RỒI ĐÂY!
    (window as any).L = this.L;     // gán để bên ngoài dùng chung

    // Bây giờ this.L.map chắc chắn là function
    this.map = this.L.map(this.mapContainer.nativeElement).setView([10.76, 106.66], 13);

    this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);

    this.map.on('click', (e: any) => {
      const { lat, lng } = e.latlng;
      this.setMarker(lat, lng);
      this.locationSelect.emit({ lat, lng });
    });

    // Marker mặc định
    this.setMarker(10.76, 106.66);
  }

  public setMarker(lat: number, lng: number) {
    if (!this.map || !this.L) {
      setTimeout(() => this.setMarker(lat, lng), 100);
      return;
    }

    if (this.marker) this.marker.remove();

    const icon = this.L.divIcon({
      className: 'custom-marker',
      html: `<iconify-icon icon="mdi:map-marker" width="44" height="44" style="color:#e74c3c; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.4));"></iconify-icon>`,
      iconSize: [44, 44],
      iconAnchor: [22, 44],
    });

    this.marker = this.L.marker([lat, lng], { icon }).addTo(this.map);
    this.map.setView([lat, lng], 15);

    this.marker = this.L.marker([lat, lng], { draggable: true }).addTo(this.map);

    this.marker.on('dragend', (e: any) => {
      const pos = e.target.getLatLng();
      this.locationSelect.emit({ lat: pos.lat, lng: pos.lng });
    });
  }
}