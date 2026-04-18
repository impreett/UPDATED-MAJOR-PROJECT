import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Footer } from '../../components/footer/footer';

@Component({
  selector: 'app-terms',
  imports: [CommonModule, RouterLink, Footer],
  templateUrl: './terms.html',
  styleUrl: './terms.css',
})
export class Terms {

}
