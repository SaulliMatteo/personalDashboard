import { retryDelayMs } from "../../core/cloud/backoff";
import type { PresenceChannel, PresenceChannelStatus, PresenceListeners } from "../../core/cloud/presence";

/*
 * I canali di presenza di un modulo, uno per gruppo, qualunque cosa mandino: entra ed esce quando cambiano i
 * gruppi, manda il proprio stato solo quando cambia (e appena entrato, al massimo una volta ogni
 * `minTrackIntervalMs`), rientra da solo con attese crescenti se un canale cade. Cosa si manda e come si legge
 * lo decide il modulo con un `PresenceCodec`.
 *
 * Realtime chiude un canale che riceve più di 5 aggiornamenti di presenza in 30 s (CLIENT_PRESENCE_MAX_CALLS): la
 * presenza parte quindi al massimo PRESENCE_MAX_TRACKS volte per finestra, sempre con l'ultimo stato. Con la via
 * rapida (`fastPath`) ogni cambio parte subito anche in broadcast sullo stesso canale, e chi lo riceve lo usa al
 * posto della presenza di quel dispositivo finché la presenza non lo raggiunge: così un cambio di posto arriva in
 * un attimo anche se la presenza aspetta. La presenza resta la fonte di chi c'è: un broadcast di un dispositivo che
 * non è nel canale si ignora.
 * Puro: canali, orologio e timer arrivano da fuori (lo prova scripts/gruppi/presence.test.mts).
 */

export type ChannelState = "joining" | "joined" | "error";

/** Aggiornamenti di presenza per canale in una finestra (il server ne ammette 5: uno di margine). */
export const PRESENCE_MAX_TRACKS = 4;
export const PRESENCE_WINDOW_MS = 30_000;

/** Campo aggiunto al payload: quale istanza dell'app lo manda (casuale, non è l'id del dispositivo). */
const INSTANCE_FIELD = "_i";

export interface PresenceSnapshot<P> {
  /** gruppo → utente → stato (validato). Chi non è nel canale non c'è: offline. */
  members: Record<string, Record<string, P>>;
  channels: Record<string, ChannelState>;
}

export interface PresenceCodec<L, P> {
  /** Il proprio payload per un gruppo, dallo stato locale; `offsetMs` porta l'ora locale a quella del server. */
  build: (local: L, groupId: string, offsetMs: number) => P;
  /** Lo stato di un canale validato: utente → payload (chi non ne ha di validi non compare). */
  parse: (raw: Record<string, unknown[]>, serverNow: number) => Record<string, P>;
}

export interface PresenceHubDeps<P> {
  now: () => number;
  join: (groupId: string, listeners: PresenceListeners) => PresenceChannel;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  onChange: (snapshot: PresenceSnapshot<P>) => void;
}

export interface PresenceHubOptions {
  /** Distanza minima tra due invii nello stesso canale (0 = subito): l'ultimo stato parte comunque, dopo. */
  minTrackIntervalMs?: number;
  /** Via rapida in broadcast: `key` è la chiave di presenza (l'utente), `instance` un id casuale di questa istanza. */
  fastPath?: { key: string; instance: string };
}

interface GroupChannel {
  /** null solo per un attimo, mentre si entra */
  channel: PresenceChannel | null;
  state: ChannelState;
  raw: Record<string, unknown[]>;
  /** ultimo payload mandato in presenza (JSON), per non rimandare lo stesso */
  sent: string | null;
  /** quando è partito l'ultimo invio (ora locale) */
  sentAt: number;
  /** istanti degli invii di presenza nella finestra del limite (restano anche rientrando) */
  trackTimes: number[];
  /** ultimo payload mandato in broadcast (JSON) e quando */
  fastSent: string | null;
  fastAt: number;
  /** stati arrivati in broadcast: utente → istanza → payload, finché la presenza non li raggiunge */
  fast: Record<string, Record<string, Record<string, unknown>>>;
  /** invio rimandato (intervallo minimo o limite della presenza) */
  pending: unknown;
  failures: number;
  retry: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** JSON con le chiavi in ordine: il server può restituire la presenza con un altro ordine. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function instanceOf(entry: unknown): string | null {
  return isRecord(entry) && typeof entry[INSTANCE_FIELD] === "string" ? entry[INSTANCE_FIELD] : null;
}

function withoutInstance(entry: unknown): unknown {
  if (!isRecord(entry) || !(INSTANCE_FIELD in entry)) return entry;
  const { [INSTANCE_FIELD]: _instance, ...rest } = entry;
  return rest;
}

export class PresenceHub<L, P> {
  private readonly deps: PresenceHubDeps<P>;
  private readonly codec: PresenceCodec<L, P>;
  private readonly minIntervalMs: number;
  private readonly fastPath: PresenceHubOptions["fastPath"] | null;
  private readonly groups = new Map<string, GroupChannel>();
  private offsetMs = 0;
  private local: L;
  private stopped = false;

  constructor(deps: PresenceHubDeps<P>, codec: PresenceCodec<L, P>, initial: L, options: PresenceHubOptions = {}) {
    this.deps = deps;
    this.codec = codec;
    this.local = initial;
    this.minIntervalMs = options.minTrackIntervalMs ?? 0;
    this.fastPath = options.fastPath ?? null;
  }

  serverNow(): number {
    return this.deps.now() + this.offsetMs;
  }

  setOffset(offsetMs: number): void {
    this.offsetMs = offsetMs;
    for (const groupId of this.groups.keys()) this.flush(groupId);
    this.emit();
  }

  /** I gruppi in cui stare (quelli con il modulo attivo). */
  setGroups(groupIds: string[]): void {
    if (this.stopped) return;
    const wanted = new Set(groupIds);
    for (const groupId of [...this.groups.keys()]) if (!wanted.has(groupId)) this.leave(groupId);
    for (const groupId of wanted) if (!this.groups.has(groupId)) this.join(groupId);
    this.emit();
  }

  getLocal(): L {
    return this.local;
  }

  setLocal(local: L): void {
    this.local = local;
    for (const groupId of this.groups.keys()) this.flush(groupId);
  }

  stop(): void {
    this.stopped = true;
    for (const groupId of [...this.groups.keys()]) this.leave(groupId);
  }

  /** Il payload per un gruppo, come verrebbe mandato adesso. */
  payloadFor(groupId: string): P {
    return this.codec.build(this.local, groupId, this.offsetMs);
  }

  private join(groupId: string): void {
    const previous = this.groups.get(groupId);
    const entry: GroupChannel = {
      channel: null,
      state: "joining",
      raw: {},
      sent: null,
      sentAt: -Infinity,
      trackTimes: previous?.trackTimes ?? [],
      fastSent: null,
      fastAt: -Infinity,
      fast: {},
      pending: null,
      failures: previous?.failures ?? 0,
      retry: null,
    };
    this.groups.set(groupId, entry);
    entry.channel = this.deps.join(groupId, {
      sync: (raw) => {
        if (this.groups.get(groupId) !== entry) return;
        entry.raw = raw;
        this.pruneFast(entry);
        this.emit();
      },
      message: (raw) => this.onFast(groupId, entry, raw),
      status: (status) => this.onStatus(groupId, entry, status),
    });
  }

  private onStatus(groupId: string, entry: GroupChannel, status: PresenceChannelStatus): void {
    if (this.stopped || this.groups.get(groupId) !== entry) return;
    if (status === "joined") {
      entry.state = "joined";
      entry.failures = 0;
      entry.sent = null; // appena entrati si manda sempre
      entry.fastSent = null;
      this.flush(groupId);
    } else if (entry.state !== "error") {
      // canale caduto (rete, token scaduto, accesso negato): si esce e si riprova più tardi
      entry.state = "error";
      entry.raw = {};
      entry.fast = {};
      this.cancelPending(entry);
      void entry.channel?.leave().catch(() => {});
      const delay = retryDelayMs(entry.failures);
      entry.failures += 1;
      entry.retry = this.deps.setTimer(() => {
        if (this.stopped || this.groups.get(groupId) !== entry) return;
        this.join(groupId);
        this.emit();
      }, delay);
    }
    this.emit();
  }

  /** Uno stato arrivato in broadcast: vale solo per un dispositivo già nel canale (un messaggio non fa comparire nessuno). */
  private onFast(groupId: string, entry: GroupChannel, raw: unknown): void {
    if (this.stopped || !this.fastPath || this.groups.get(groupId) !== entry) return;
    if (!isRecord(raw) || typeof raw.k !== "string" || !isRecord(raw.p)) return;
    const instance = instanceOf(raw.p);
    if (instance === null || !Object.hasOwn(entry.raw, raw.k)) return;
    if (!entry.raw[raw.k].some((e) => instanceOf(e) === instance)) return;
    entry.fast[raw.k] = { ...entry.fast[raw.k], [instance]: raw.p };
    this.emit();
  }

  /** Toglie gli stati in broadcast raggiunti dalla presenza o di dispositivi usciti dal canale. */
  private pruneFast(entry: GroupChannel): void {
    for (const [key, byInstance] of Object.entries(entry.fast)) {
      const entries = Object.hasOwn(entry.raw, key) ? entry.raw[key] : [];
      for (const [instance, payload] of Object.entries(byInstance)) {
        const current = entries.find((e) => instanceOf(e) === instance);
        if (current === undefined || stableJson(current) === stableJson(payload)) delete byInstance[instance];
      }
      if (Object.keys(byInstance).length === 0) delete entry.fast[key];
    }
  }

  private leave(groupId: string): void {
    const entry = this.groups.get(groupId);
    if (!entry) return;
    this.groups.delete(groupId);
    if (entry.retry !== null) this.deps.clearTimer(entry.retry);
    this.cancelPending(entry);
    void entry.channel?.leave().catch(() => {});
  }

  private cancelPending(entry: GroupChannel): void {
    if (entry.pending === null) return;
    this.deps.clearTimer(entry.pending);
    entry.pending = null;
  }

  /** Manda lo stato se è cambiato: in broadcast subito (via rapida), in presenza nei limiti; il resto dopo. */
  private flush(groupId: string): void {
    const entry = this.groups.get(groupId);
    if (!entry || entry.state !== "joined" || !entry.channel) return;
    // un invio rimandato si ricalcola: i tempi dipendono solo da fastAt, sentAt e trackTimes
    this.cancelPending(entry);
    const channel = entry.channel;
    const payload = this.payloadFor(groupId) as unknown as Record<string, unknown>;
    const body = this.fastPath ? { ...payload, [INSTANCE_FIELD]: this.fastPath.instance } : payload;
    const json = JSON.stringify(body);
    const now = this.deps.now();
    let wait = Infinity;

    if (this.fastPath && json !== entry.fastSent) {
      const early = entry.fastAt + this.minIntervalMs - now;
      if (early > 0) wait = early;
      else {
        entry.fastSent = json;
        entry.fastAt = now;
        void channel.send({ k: this.fastPath.key, p: body }).catch(() => {
          // non arrivato: lo porta la presenza, o il prossimo cambio
          if (this.groups.get(groupId) === entry) entry.fastSent = null;
        });
      }
    }

    if (json !== entry.sent) {
      entry.trackTimes = entry.trackTimes.filter((t) => t > now - PRESENCE_WINDOW_MS);
      // con la via rapida l'intervallo minimo vale per il broadcast; la presenza rispetta solo il limite del server
      const early = this.fastPath ? 0 : entry.sentAt + this.minIntervalMs - now;
      const full = entry.trackTimes.length >= PRESENCE_MAX_TRACKS ? entry.trackTimes[0] + PRESENCE_WINDOW_MS - now : 0;
      const delay = Math.max(early, full);
      if (delay > 0) wait = Math.min(wait, delay);
      else {
        entry.sent = json;
        entry.sentAt = now;
        entry.trackTimes.push(now);
        void channel.track(body).catch(() => {
          // non mandato: si riprova al prossimo cambio o al rientro nel canale
          if (this.groups.get(groupId) === entry) entry.sent = null;
        });
      }
    }

    if (wait !== Infinity) {
      // troppo presto: parte l'ultimo stato quando si può
      entry.pending = this.deps.setTimer(() => {
        if (this.groups.get(groupId) !== entry) return;
        entry.pending = null;
        this.flush(groupId);
      }, wait);
    }
  }

  private emit(): void {
    if (this.stopped) return;
    const serverNow = this.serverNow();
    const members: PresenceSnapshot<P>["members"] = {};
    const channels: PresenceSnapshot<P>["channels"] = {};
    for (const [groupId, entry] of this.groups) {
      channels[groupId] = entry.state;
      const raw: Record<string, unknown[]> = {};
      for (const [key, entries] of Object.entries(entry.raw)) {
        const fast = Object.hasOwn(entry.fast, key) ? entry.fast[key] : {};
        raw[key] = entries.map((e) => {
          const instance = instanceOf(e);
          return withoutInstance(instance !== null && Object.hasOwn(fast, instance) ? fast[instance] : e);
        });
      }
      members[groupId] = this.codec.parse(raw, serverNow);
    }
    this.deps.onChange({ members, channels });
  }
}
