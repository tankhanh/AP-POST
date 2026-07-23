import {
  Component,
  Inject,
  PLATFORM_ID,
  AfterViewInit,
  ViewChild,
  ElementRef,
  Output,
  EventEmitter,
  OnDestroy,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-map-picker',
  standalone: true,
  templateUrl: './map-picker.html',
  styles: `
    .map-picker-canvas {
      width: 100%;
      height: 300px;
      border-radius: 24px;
    }

    :host ::ng-deep .map-picker-marker {
      border: 0;
      background: transparent;
    }

    :host ::ng-deep .map-picker-marker span {
      width: 38px;
      height: 38px;
      border: 3px solid #fff;
      border-radius: 50% 50% 50% 10%;
      display: block;
      background: var(--wise-danger);
      box-shadow: 0 5px 14px rgba(14, 15, 12, 0.28);
      transform: rotate(-45deg);
    }
  `,
})
export class MapPickerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;

  @Output() locationSelect = new EventEmitter<{ lat: number; lng: number }>();

  private map: any;
  private marker: any;
  private L: any;

  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

  async ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    const leafletModule = await import('leaflet');
    this.L = leafletModule.default;
    (window as any).L = this.L;

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

  ngOnDestroy() {
    this.map?.remove();
  }

  public setMarker(lat: number, lng: number) {
    if (!this.map || !this.L) {
      setTimeout(() => this.setMarker(lat, lng), 100);
      return;
    }

    if (this.marker) this.marker.remove();

    const icon = this.L.divIcon({
      className: 'map-picker-marker',
      html: '<span></span>',
      iconSize: [38, 38],
      iconAnchor: [19, 38],
    });

    this.marker = this.L.marker([lat, lng], { icon, draggable: true }).addTo(this.map);
    this.map.setView([lat, lng], 15);

    this.marker.on('dragend', (e: any) => {
      const pos = e.target.getLatLng();
      this.locationSelect.emit({ lat: pos.lat, lng: pos.lng });
    });
  }
}
