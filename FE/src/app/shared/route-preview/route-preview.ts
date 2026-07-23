import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import * as L from 'leaflet';
import 'leaflet-routing-machine';

@Component({
  selector: 'app-route-preview',
  standalone: true,
  template: `<div #routeMap class="route-map" aria-label="Bản đồ lộ trình giao hàng"></div>`,
  styles: `
    .route-map {
      height: 300px;
      margin-top: 15px;
      border-radius: 24px;
    }

    :host ::ng-deep .ap-route-marker {
      border: 0;
      background: transparent;
    }

    :host ::ng-deep .ap-route-marker span {
      width: 36px;
      height: 36px;
      border: 3px solid #fff;
      border-radius: 50%;
      display: grid;
      place-items: center;
      color: #163300;
      background: #9fe870;
      box-shadow: 0 4px 14px rgba(14, 15, 12, 0.24);
      font-size: 13px;
      font-weight: 900;
    }

    :host ::ng-deep .ap-route-marker.is-delivery span {
      color: #fff;
      background: #163300;
    }
  `,
})
export class RoutePreviewComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() pickup: { lat: number; lng: number } | null = null;
  @Input() delivery: { lat: number; lng: number } | null = null;
  @ViewChild('routeMap', { static: true }) mapElement!: ElementRef<HTMLElement>;

  private map!: L.Map;
  private routingControl: any;

  ngAfterViewInit() {
    this.initMap();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.map && (changes['pickup'] || changes['delivery']) && this.pickup && this.delivery) {
      this.updateRoute();
    }
  }

  ngOnDestroy() {
    this.routingControl?.remove();
    this.map?.remove();
  }

  private initMap() {
    this.map = L.map(this.mapElement.nativeElement).setView([10.762622, 106.660172], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(this.map);

    if (this.pickup && this.delivery) this.updateRoute();
  }

  private updateRoute() {
    if (this.routingControl) {
      this.map.removeControl(this.routingControl);
    }

    this.routingControl = (L as any).Routing.control({
      waypoints: [
        L.latLng(this.pickup!.lat, this.pickup!.lng),
        L.latLng(this.delivery!.lat, this.delivery!.lng),
      ],
      routeWhileDragging: false,
      addWaypoints: false,
      createMarker: (i: number, wp: any) => {
        const isPickup = i === 0;
        const icon = L.divIcon({
          className: `ap-route-marker${isPickup ? '' : ' is-delivery'}`,
          html: `<span>${isPickup ? 'Gửi' : 'Nhận'}</span>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });
        return L.marker(wp.latLng, {
          icon,
          alt: isPickup ? 'Điểm gửi hàng' : 'Điểm nhận hàng',
        });
      },
      lineOptions: { styles: [{ color: '#e74c3c', weight: 6, opacity: 0.8 }] },
      show: true,
      language: 'vi',
    }).addTo(this.map);

    // Lắng nghe khi lộ trình được tính xong → lấy khoảng cách + thời gian
    this.routingControl.on('routesfound', (e: any) => {
      const route = e.routes[0];
      const distance = (route.summary.totalDistance / 1000).toFixed(1); // km
      const time = Math.round(route.summary.totalTime / 60); // phút

      this.map.fire('routecalculated', { distance, time });
    });
  }
}
