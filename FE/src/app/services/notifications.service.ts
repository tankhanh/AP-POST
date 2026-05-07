import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { env } from '../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class NotificationsService {
  private base = `${env.baseUrl}/notifications`;

  constructor(private http: HttpClient) {}

  private getHeaders() {
    const token = localStorage.getItem('access_token') || '';
    return { Authorization: `Bearer ${token}` };
  }

  list(page = 1, pageSize = 10, qs = ''): Observable<any> {
    const url = `${this.base}?current=${page}&pageSize=${pageSize}${qs ? `&${qs}` : ''}`;
    return this.http.get(url, { headers: this.getHeaders() });
  }

  get(id: string): Observable<any> {
    return this.http.get(`${this.base}/${id}`, { headers: this.getHeaders() });
  }

  create(dto: any): Observable<any> {
    return this.http.post(this.base, dto, { headers: this.getHeaders() });
  }

  update(id: string, dto: any): Observable<any> {
    return this.http.patch(`${this.base}/${id}`, dto, { headers: this.getHeaders() });
  }

  remove(id: string): Observable<any> {
    return this.http.delete(`${this.base}/${id}`, { headers: this.getHeaders() });
  }

  markAllRead(): Observable<any> {
    return this.http.patch(`${this.base}/mark-all-read`, {}, { headers: this.getHeaders() });
  }
}
