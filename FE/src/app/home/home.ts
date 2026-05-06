import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.html',
  imports: [CommonModule, FormsModule, RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Home {}
