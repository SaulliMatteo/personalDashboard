/**
 * Conta i secondi in cui un video è STATO IN RIPRODUZIONE (non la posizione, non il tempo
 * a pagina aperta). Classe pura con orologio iniettato: si testa senza browser.
 *
 * Funziona a "tick": chi la usa chiama `tick()` ogni ~2 s mentre il player è attivo e
 * `setPlaying()` a ogni cambio di stato. Ogni tick aggiunge al massimo `capSeconds`:
 * se il PC va in sospensione o il WebView viene congelato, il tick successivo arriva
 * dopo ore, ma si contano solo pochi secondi invece dell'intero buco.
 * I secondi sono "da orologio": a velocità 2x un video di 10 minuti si guarda in 5.
 *
 * Gli intervalli si consegnano a `onSegment` quando la riproduzione si ferma, ogni
 * `flushEverySeconds` accumulati (così un crash perde al più ~30 s) e allo smontaggio.
 * Sotto un secondo non si consegna nulla; il resto frazionario non va perso.
 */
export interface WatchTrackerOptions {
  now: () => number;
  onSegment: (startedAt: number, endedAt: number, seconds: number) => void;
  capSeconds?: number;
  flushEverySeconds?: number;
}

export class WatchTracker {
  private playing = false;
  private lastAt = 0;
  private accumulated = 0;
  private startedAt = 0;
  private readonly now: () => number;
  private readonly onSegment: WatchTrackerOptions["onSegment"];
  private readonly cap: number;
  private readonly flushEvery: number;

  constructor(options: WatchTrackerOptions) {
    this.now = options.now;
    this.onSegment = options.onSegment;
    this.cap = options.capSeconds ?? 5;
    this.flushEvery = options.flushEverySeconds ?? 30;
  }

  /** Il player è (true) o non è più (false) in riproduzione. Ripetere lo stesso valore non fa nulla. */
  setPlaying(playing: boolean): void {
    if (playing === this.playing) return;
    if (playing) {
      this.playing = true;
      this.lastAt = this.now();
      if (this.accumulated === 0) this.startedAt = this.lastAt;
    } else {
      this.accumulate();
      this.playing = false;
      this.flush();
    }
  }

  /** Da chiamare periodicamente mentre il player è attivo. */
  tick(): void {
    if (!this.playing) return;
    this.accumulate();
    if (this.accumulated >= this.flushEvery) this.flush();
  }

  /** Consegna i secondi interi accumulati, tenendo il resto. Sicuro da chiamare in qualunque momento. */
  flush(): void {
    const whole = Math.floor(this.accumulated);
    if (whole < 1) return;
    const endedAt = this.now();
    this.onSegment(this.startedAt, endedAt, whole);
    this.accumulated -= whole;
    this.startedAt = endedAt;
  }

  /** Smontaggio: ferma e consegna tutto. */
  dispose(): void {
    this.setPlaying(false);
    this.flush();
  }

  private accumulate(): void {
    const t = this.now();
    const delta = Math.max(0, (t - this.lastAt) / 1000);
    this.accumulated += Math.min(delta, this.cap);
    this.lastAt = t;
  }
}
