import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SoundService {
  play(): void {
    try {
      const muted = localStorage.getItem('notifications_muted') === '1';
      if (muted) return;
      this.playTone();
    } catch {
      // Browsers may block sound until the user interacts with the page.
    }
  }

  setMuted(value: boolean) {
    try {
      localStorage.setItem('notifications_muted', value ? '1' : '0');
    } catch {}
  }

  isMuted(): boolean {
    try {
      return localStorage.getItem('notifications_muted') === '1';
    } catch {
      return false;
    }
  }

  private playTone() {
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
        } catch {}
      }, 250);
    } catch {
      // ignore audio failures
    }
  }
}
