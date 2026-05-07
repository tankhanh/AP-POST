import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SoundService {
  // Play a short notification sound. Respect user mute preference (localStorage) and prefer bundled audio file.
  play(): void {
    try {
      const muted = localStorage.getItem('notifications_muted') === '1';
      if (muted) return;
      const audio = new Audio('/assets/sounds/notification.wav');
      audio.play().catch(() => this.fallbackBeep());
    } catch (e) {
      this.fallbackBeep();
    }
  }

  setMuted(value: boolean) {
    try {
      localStorage.setItem('notifications_muted', value ? '1' : '0');
    } catch (e) {}
  }

  isMuted(): boolean {
    try {
      return localStorage.getItem('notifications_muted') === '1';
    } catch (e) {
      return false;
    }
  }

  private fallbackBeep() {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.18);
      setTimeout(() => {
        try {
          o.stop();
          ctx.close();
        } catch (e) {}
      }, 250);
    } catch (e) {
      // ignore audio failures
    }
  }
}
