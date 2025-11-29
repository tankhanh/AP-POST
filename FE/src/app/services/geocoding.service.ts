import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, catchError, of } from 'rxjs';  // Thêm catchError, of

@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private cache = new Map<string, any[]>();

  constructor(private http: HttpClient) { }

  search(address: string) {
    const url = `https://nominatim.openstreetmap.org/search`;
    return this.http.get<any[]>(url, {
      params: {
        format: 'json',
        q: address,
        countrycodes: 'vn',
        limit: '1',
        addressdetails: '1'
      },
      headers: {
        'User-Agent': 'MyDeliveryApp/1.0 (your-email@gmail.com)' // BẮT BUỘC PHẢI CÓ
      }
    }).pipe(
      map(res => res && res.length > 0 ? [{
        lat: res[0].lat,
        lon: res[0].lon,
        display_name: res[0].display_name
      }] : []),
      catchError(err => {
        console.warn('Geocoding error:', err);
        return of([]);
      })
    );
  }

  private fallbackNominatim(address: string, cacheKey: string) {
    return this.http.get<any[]>(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=vn&limit=1`,
      {
        headers: {
          'User-Agent': 'MyDeliveryApp/1.0 (your_email@example.com)',
        },
      }
    ).pipe(
      map((res) => {
        if (res && res.length > 0) {
          // Cache success
          this.cache.set(cacheKey, res);
          setTimeout(() => this.cache.delete(cacheKey), 10 * 60 * 1000);
          console.log('✅ Nominatim fallback success:', res[0]);
        } else {
          console.warn('❌ Nominatim also empty');
        }
        return res || [];
      }),
      catchError((err) => {
        console.error('❌ Fallback failed:', err);
        return of([]);
      })
    );
  }
}