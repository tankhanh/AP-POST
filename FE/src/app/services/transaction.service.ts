import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { env } from '../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class TransactionService {
  private apiUrl = `${env.baseUrl}/transaction`;

  constructor(private http: HttpClient) {}

  getTransactionsByAccount(accId: string) {
    const token = localStorage.getItem('access_token');
    return this.http.get<any[]>(`${this.apiUrl}/list/${accId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  makeTransaction(accId: string, transMoney: number, transType: number): Observable<any> {
    const token = localStorage.getItem('access_token');
    return this.http.post(
      `${this.apiUrl}/make`,
      { accId, transMoney, transType },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
  }
}
