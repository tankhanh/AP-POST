import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { env } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly API_URL = `${env.baseUrl}/locations`;

  constructor(private http: HttpClient) {}

  private getAuthHeaders() {
    const token = localStorage.getItem('access_token') || '';
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  getProvinces(): Observable<any> {
    return this.http.get(`${this.API_URL}/provinces`, { headers: this.getAuthHeaders() });
  }

  getCommunes(provinceId: string): Observable<any> {
    return this.http.get(`${this.API_URL}/communes`, {
      headers: this.getAuthHeaders(),
      params: { provinceId },
    });
  }
}
