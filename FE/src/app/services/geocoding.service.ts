import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class GeocodingService {

  constructor(private http: HttpClient) {}

  search(address: string) {
    return this.http.get<any[]>(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`
    );
  }
}
