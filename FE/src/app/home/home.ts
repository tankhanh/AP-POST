import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  Inject,
  OnInit,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { TransactionService } from '../services/transaction.service';
import { computed } from '@angular/core';

@Component({
  selector: 'home',
  imports: [CommonModule],
  templateUrl: './home.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Home implements OnInit {
  constructor() {}

  ngOnInit() {}
}
