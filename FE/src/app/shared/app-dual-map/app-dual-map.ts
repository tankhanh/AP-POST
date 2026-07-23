// src/app/shared/app-dual-map/app-dual-map.component.ts
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  Component,
  Input,
  Output,
  EventEmitter,
  AfterViewInit,
  OnChanges,
  SimpleChanges,
  ElementRef,
  ViewChild,
  ChangeDetectorRef,
  OnDestroy,
} from '@angular/core';
import * as L from 'leaflet';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-dual-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dual-map-wrapper">
      <h5 class="fw-bold text-secondary mb-3">Kéo thả để chỉnh vị trí chính xác</h5>
      <div #mapContainer class="dual-map-canvas" aria-label="Bản đồ điểm lấy và giao hàng"></div>
      <div class="text-center mt-3">
        <strong class="text-success">LẤY HÀNG</strong> ←→
        <strong class="text-danger">GIAO HÀNG</strong> <br /><small
          >Khoảng cách: {{ distance | number: '1.1-1' }} km</small
        >
      </div>
    </div>
  `,
  styles: [
    `
      .dual-map-wrapper {
        margin: 20px 0;
      }

      .dual-map-canvas {
        height: 500px;
        border-radius: 24px;
        overflow: hidden;
        box-shadow: var(--wise-ring);
      }

      @media (max-width: 767.98px) {
        .dual-map-canvas {
          height: 360px;
        }
      }

      :host ::ng-deep .dual-map-marker {
        border: 0;
        background: transparent;
      }

      :host ::ng-deep .dual-map-marker span {
        min-width: 104px;
        border: 3px solid #fff;
        border-radius: 999px;
        padding: 8px 14px;
        display: inline-flex;
        justify-content: center;
        color: var(--wise-green);
        background: var(--wise-lime);
        box-shadow: 0 5px 14px rgba(14, 15, 12, 0.24);
        font-size: 12px;
        font-weight: 900;
      }

      :host ::ng-deep .dual-map-marker.is-delivery span {
        color: #fff;
        background: var(--wise-green);
      }
    `,
  ],
})
export class DualMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() pickup!: { lat: number; lng: number };
  @Input() delivery!: { lat: number; lng: number };

  @Output() pickupMoved = new EventEmitter<{ lat: number; lng: number }>();
  @Output() deliveryMoved = new EventEmitter<{ lat: number; lng: number }>();
  @Output() locationChanged = new EventEmitter<{
    type: 'pickup' | 'delivery';
    lat: number;
    lng: number;
    address?: string;
  }>();

  @ViewChild('mapContainer') mapElement!: ElementRef;

  private map!: L.Map;
  private pickupMarker!: L.Marker;
  private deliveryMarker!: L.Marker;
  private routeLine!: L.Polyline;
  distance = 0;

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.map && (changes['pickup'] || changes['delivery'])) {
      this.updateMarkersAndRoute();
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  constructor(
    private cdr: ChangeDetectorRef,
    private http: HttpClient,
  ) {}

  private initMap(): void {
    this.map = L.map(this.mapElement.nativeElement).setView([16.0, 108.0], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(this.map);

    if (this.pickup && this.delivery) {
      this.updateMarkersAndRoute();
    }
  }

  private updateMarkersAndRoute(): void {
    // Xóa cũ
    if (this.pickupMarker) this.map.removeLayer(this.pickupMarker);
    if (this.deliveryMarker) this.map.removeLayer(this.deliveryMarker);
    if (this.routeLine) this.map.removeLayer(this.routeLine);

    // Icon đẹp
    const pickupIcon = L.divIcon({
      className: 'dual-map-marker',
      html: '<span>LẤY HÀNG</span>',
      iconSize: [120, 40],
      iconAnchor: [60, 40],
    });
    const deliveryIcon = L.divIcon({
      className: 'dual-map-marker is-delivery',
      html: '<span>GIAO HÀNG</span>',
      iconSize: [120, 40],
      iconAnchor: [60, 40],
    });

    // Marker có thể kéo
    this.pickupMarker = L.marker([this.pickup.lat, this.pickup.lng], {
      icon: pickupIcon,
      draggable: true,
    }).addTo(this.map);

    this.deliveryMarker = L.marker([this.delivery.lat, this.delivery.lng], {
      icon: deliveryIcon,
      draggable: true,
    }).addTo(this.map);

    // Trong dragend của pickup
    this.pickupMarker.on('dragend', async (e: any) => {
      const pos = e.target.getLatLng();
      this.pickupMoved.emit({ lat: pos.lat, lng: pos.lng });

      // Reverse geocoding
      const address = await this.reverseGeocode(pos.lat, pos.lng);
      this.locationChanged.emit({ type: 'pickup', lat: pos.lat, lng: pos.lng, address });
    });

    this.deliveryMarker.on('dragend', async (e: any) => {
      const pos = e.target.getLatLng();
      this.deliveryMoved.emit({ lat: pos.lat, lng: pos.lng });
      const address = await this.reverseGeocode(pos.lat, pos.lng);
      this.locationChanged.emit({ type: 'delivery', lat: pos.lat, lng: pos.lng, address });
    });

    // Vẽ đường nối
    this.routeLine = L.polyline(
      [
        [this.pickup.lat, this.pickup.lng],
        [this.delivery.lat, this.delivery.lng],
      ],
      { color: '#3498db', weight: 7, opacity: 0.9 },
    ).addTo(this.map);

    // Tính khoảng cách
    const R = 6371;
    const dLat = ((this.delivery.lat - this.pickup.lat) * Math.PI) / 180;
    const dLon = ((this.delivery.lng - this.pickup.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((this.pickup.lat * Math.PI) / 180) *
        Math.cos((this.delivery.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    this.distance = Math.round(R * c * 10) / 10;

    // Zoom vừa
    this.map.fitBounds(this.routeLine.getBounds(), { padding: [50, 50] });

    this.cdr.detectChanges();
  }

  private async reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      const res = await firstValueFrom(
        this.http.get<any>(`https://nominatim.openstreetmap.org/reverse`, {
          params: { format: 'json', lat, lon: lng, zoom: 18, addressdetails: 1 },
        }),
      );
      return res.display_name || '';
    } catch {
      return '';
    }
  }
}
