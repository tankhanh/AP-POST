import { Component, Input, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet-routing-machine';

@Component({
  selector: 'app-route-preview',
  standalone: true,
  template: `<div id="routeMap" style="height: 300px; border-radius: 12px; margin-top: 15px;"></div>`,
})
export class RoutePreviewComponent implements AfterViewInit, OnChanges {
  @Input() pickup: { lat: number; lng: number } | null = null;
  @Input() delivery: { lat: number; lng: number } | null = null;

  private map!: L.Map;
  private routingControl: any;

  ngAfterViewInit() {
    this.initMap();
  }

  ngOnChanges(changes: SimpleChanges) {
    if ((changes['pickup'] || changes['delivery']) && this.pickup && this.delivery) {
      this.updateRoute();
    }
  }

  private initMap() {
    this.map = L.map('routeMap').setView([10.762622, 106.660172], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);
  }

  private updateRoute() {
    if (this.routingControl) {
      this.map.removeControl(this.routingControl);
    }

    this.routingControl = (L as any).Routing.control({
      waypoints: [
        L.latLng(this.pickup!.lat, this.pickup!.lng),
        L.latLng(this.delivery!.lat, this.delivery!.lng)
      ],
      routeWhileDragging: false,
      addWaypoints: false,
      createMarker: (i: number, wp: any) => {
        const icon = i === 0
          ? L.icon({ iconUrl: 'assets/icons/pickup.png', iconSize: [35, 35] })
          : L.icon({ iconUrl: 'assets/icons/delivery.png', iconSize: [35, 35] });
        return L.marker(wp.latLng, { icon });
      },
      lineOptions: { styles: [{ color: '#e74c3c', weight: 6, opacity: 0.8 }] },
      show: true,
      language: 'vi'
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