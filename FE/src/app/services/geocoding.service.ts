import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';

interface GeocodingResult {
  lat: string;
  lon: string;
  display_name: string;
}

interface ReverseGeocodingResult {
  road: string;
  house_number: string;
  suburb: string;
  city_district: string;
  city: string;
  state: string;
  postcode: string;
  display_name: string;
}

@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private readonly endpoint = 'https://nominatim.openstreetmap.org';
  private readonly cache = new Map<string, unknown>();
  private readonly cacheLifetimeMs = 10 * 60 * 1000;

  constructor(private readonly http: HttpClient) {}

  search(address: string): Observable<GeocodingResult[]> {
    const normalizedAddress = address.trim();
    const cacheKey = `search:${normalizedAddress.toLocaleLowerCase('vi')}`;
    const cached = this.cache.get(cacheKey) as GeocodingResult[] | undefined;
    if (cached) return of(cached);

    return this.http
      .get<GeocodingResult[]>(`${this.endpoint}/search`, {
        params: {
          format: 'json',
          q: normalizedAddress,
          countrycodes: 'vn',
          limit: '1',
          addressdetails: '1',
        },
      })
      .pipe(
        map((results) =>
          (results ?? []).slice(0, 1).map(({ lat, lon, display_name }) => ({
            lat,
            lon,
            display_name,
          })),
        ),
        tap((results) => this.storeTemporarily(cacheKey, results)),
        catchError(() => of([])),
      );
  }

  reverse(lat: number, lon: number): Observable<ReverseGeocodingResult | null> {
    const cacheKey = `reverse:${lat.toFixed(5)}:${lon.toFixed(5)}`;
    const cached = this.cache.get(cacheKey) as ReverseGeocodingResult | undefined;
    if (cached) return of(cached);

    return this.http
      .get<Record<string, any>>(`${this.endpoint}/reverse`, {
        params: {
          format: 'json',
          lat: lat.toString(),
          lon: lon.toString(),
          zoom: '18',
          addressdetails: '1',
          countrycodes: 'vn',
        },
      })
      .pipe(
        map((result) => {
          const address = result?.['address'];
          if (!address) return null;
          return {
            road: address.road || address.street || '',
            house_number: address.house_number || '',
            suburb: address.suburb || address.hamlet || address.neighbourhood || '',
            city_district: address.city_district || address.suburb || '',
            city: address.city || address.town || '',
            state: address.state || address.province || '',
            postcode: address.postcode || '',
            display_name: result['display_name'] || '',
          };
        }),
        tap((result) => {
          if (result) this.storeTemporarily(cacheKey, result);
        }),
        catchError(() => of(null)),
      );
  }

  private storeTemporarily(key: string, value: unknown): void {
    this.cache.set(key, value);
    setTimeout(() => this.cache.delete(key), this.cacheLifetimeMs);
  }
}
