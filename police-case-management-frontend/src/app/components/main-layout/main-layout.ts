import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from '../header/header';
import { Navbar } from '../navbar/navbar';
import { Footer } from '../footer/footer';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, Header, Navbar, Footer],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.css',
})
export class MainLayout {}
