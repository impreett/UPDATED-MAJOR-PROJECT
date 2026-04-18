import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppFeedbackOverlay } from './components/app-feedback-overlay/app-feedback-overlay';
import { ScrollMemoryService } from './services/scroll-memory.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AppFeedbackOverlay],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly _scrollMemory = inject(ScrollMemoryService);
}
