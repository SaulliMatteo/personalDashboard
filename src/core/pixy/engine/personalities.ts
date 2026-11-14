import type { EmotionId } from "./face";

/**
 * Una personalità decide: umore di base, quali emozioni casuali pesca più
 * spesso, quanto parla, quanto spesso batte le ciglia e COSA dice.
 * Per aggiungerne una basta un elemento in PERSONALITIES.
 */
export type PhraseKey =
  | "greet_morning"
  | "greet_afternoon"
  | "greet_evening"
  | "greet_night"
  | "idle"
  | "study_start"
  | "pomodoro_done"
  | "break_over"
  | "study_stopped"
  | "autostop_warning"
  | "autostop_idle"
  | "autostop_app"
  | "screen_limit_near"
  | "screen_limit"
  | "screen_break"
  | "goal_reached"
  | "video_start"
  | "video_end"
  | "file_received"
  | "welcome_back"
  | "sleep"
  | "night"
  | "coding"
  | "music"
  | "game"
  | "chat"
  | "poke"
  | "study_math"
  | "study_science"
  | "study_lang"
  | "study_history"
  | "study_art"
  | "study_code"
  | "video_popcorn"
  | "video_cinema"
  | "video_paused"
  | "video_bored"
  | "video_late"
  | "video_scared"
  | "video_moved"
  | "office"
  | "design"
  | "browser"
  | "discord"
  | "lol"
  | "youtube"
  | "live"
  | "call"
  | "minecraft"
  | "shooter"
  | "excel"
  | "slides"
  | "blender"
  | "ai"
  | "explorer"
  | "hot"
  | "cold";

export type PersonalityId = "cheerful" | "calm" | "sleepy" | "grumpy" | "sarcastic" | "stoic";

/** Le personalità che l'utente sceglie nelle impostazioni; le altre le decide un tema (Ombra, themePersonality.ts). */
export const CHOOSABLE_PERSONALITY_IDS = ["cheerful", "calm", "sleepy", "grumpy"] as const satisfies readonly PersonalityId[];

export interface FaceTweak {
  lidTop?: number;
  lidBottom?: number;
  tilt?: number;
  /** Solo se la bocca è visibile. */
  mouthCurve?: number;
}

export interface Personality {
  id: PersonalityId;
  label: string;
  description: string;
  /** Espressione quando non succede nulla. */
  baseMood: EmotionId;
  /** Peso delle emozioni casuali (id animazione → peso). Mancante = 1. */
  emoteWeights: Partial<Record<string, number>>;
  /** Moltiplicatore della frequenza delle emozioni casuali. */
  emoteRate: number;
  /** Moltiplicatore della frequenza delle chiacchiere spontanee. */
  chattiness: number;
  /** Intervallo tra due battiti di ciglia, in ms. */
  blinkMs: [number, number];
  /** Velocità di tutte le animazioni (costumi, movimenti, appisolamenti): 1 = normale. */
  tempo: number;
  /** Ampiezza dei movimenti di tutta la faccia (saltelli, dondolii…). */
  motionAmp: number;
  /** Ritocco che la personalità dà a ogni espressione (sommato ai parametri, vedi animator.ts). */
  faceTweak: FaceTweak;
  phrases: Record<PhraseKey, string[]>;
}

/*
 * Segnaposto nelle frasi:
 *   {,name}  →  ", Matteo" (o niente se il nome non è impostato)
 *   {app}    →  nome leggibile dell'app (es. "VS Code")
 *   {min}    →  minuti
 */
export const PERSONALITIES: Record<PersonalityId, Personality> = {
  cheerful: {
    id: "cheerful",
    label: "Allegro",
    description: "Sorride spesso, festeggia tutto e ti fa il tifo.",
    baseMood: "neutral",
    emoteWeights: { emote_happy: 3, emote_laugh: 2, emote_love: 1.5, emote_wink: 2, emote_curious: 1.5, emote_sad: 0.2, emote_angry: 0.1, emote_bored: 0.3 },
    emoteRate: 1.2,
    chattiness: 1.2,
    blinkMs: [2400, 5500],
    tempo: 1.15,
    motionAmp: 1.25,
    faceTweak: { mouthCurve: 0.15 },
    phrases: {
      greet_morning: ["Buongiorno{,name}! ☀", "Pronto per oggi{,name}?", "Che bella giornata per combinare qualcosa!"],
      greet_afternoon: ["Buon pomeriggio{,name}!", "Eccoti! Mi mancavi.", "Si riparte?"],
      greet_evening: ["Buonasera{,name}!", "Serata produttiva o rilassante?", "Ciao! Com'è andata oggi?"],
      greet_night: ["Ancora sveglio{,name}?", "Notte fonda, eh?"],
      idle: ["Che si fa?", "Io sono qui, eh!", "Hai bevuto un po' d'acqua?", "Mi piace stare qui con te.", "Tutto ok?", "Dritto con la schiena!"],
      study_start: ["Si studia! Ci sono anch'io.", "Forza, concentrazione!", "Andiamo, ce la fai!"],
      pomodoro_done: ["Pomodoro fatto! 🍅", "Grande! Ti meriti una pausa.", "Un altro in cassaforte!"],
      break_over: ["Pausa finita, si riparte!", "Ricaricato? Andiamo!"],
      study_stopped: ["Bel lavoro: {min} minuti!", "Fatto! {min} minuti di studio."],
      autostop_warning: ["Ehi{,name}, ci sei ancora? 👀", "Psst! Sto per fermare il timer!", "Muovi il mouse se ci sei!"],
      autostop_idle: ["Ti ho aspettato, poi ho fermato tutto!", "Sparito{,name}? Ho salvato io il tuo studio!"],
      autostop_app: ["Beccato! Ho fermato il timer 😄", "Pausa vera allora! Timer fermato."],
      screen_limit_near: ["Occhio, il tempo sta per finire!", "Ancora un pochino e basta{,name}!"],
      screen_limit: ["Tempo scaduto! Chiudiamo?", "Limite raggiunto: l'avevi deciso tu!"],
      screen_break: ["Pausa! Sgranchisciti un po'.", "Alzati{,name}, guarda lontano e bevi un sorso d'acqua!"],
      goal_reached: ["OBIETTIVO RAGGIUNTO! 🎉", "Ce l'hai fatta! Sono fiero di te!"],
      video_start: ["Cosa guardiamo?", "Popcorn pronti!"],
      video_end: ["Finito! Bello?", "E il prossimo?"],
      file_received: ["È arrivato un file!", "Posta in arrivo! 📦"],
      welcome_back: ["Bentornato! Com'è andata con {app}?", "Eccoti{,name}! Tutto bene con {app}?", "Bentornato{,name}!"],
      sleep: ["Zzz…", "Faccio un pisolino…"],
      night: ["Si sta facendo tardi…", "Dormire fa bene alla memoria, sai?", "Ancora cinque minuti di chiacchiere?"],
      coding: ["Codice! Che stai costruendo?", "Niente bug oggi, ok?"],
      music: ["Bella questa! ♪", "Si balla!"],
      game: ["Si gioca? Fai vedere!", "Vai, vinci!"],
      chat: ["Salutami tutti!", "Chiacchiere?"],
      poke: ["Ehi! 😄", "Hihi, solletico!", "Ciao ciao!"],
      study_math: ["Facciamo due conti!", "1+1=2, e il resto lo sai tu!"],
      study_science: ["Esperimento in corso!", "Scienza! Che bello!"],
      study_lang: ["Parola per parola!", "Che bella lingua!"],
      study_history: ["C'era una volta…", "Viaggio nel tempo!"],
      study_art: ["Che capolavoro!"],
      study_code: ["Compila? Compila!", "Codice e caffè!"],
      video_popcorn: ["Popcorn pronti!", "Me ne passi uno?"],
      video_cinema: ["Effetti speciali!!", "Si spengono le luci…"],
      video_paused: ["Si riparte? Si riparte?"],
      video_bored: ["Dai che manca poco!"],
      video_late: ["Un altro episodio!"],
      video_scared: ["Non guardo, non guardo!"],
      video_moved: ["Che bello… *sniff*"],
      office: ["Scriviamo bene, eh!"],
      design: ["Ooh, che colori!"],
      browser: ["Cosa cerchi?", "Navighiamo!"],
      discord: ["Saluta tutti da parte mia!"],
      lol: ["Pentakill! (prima o poi)", "Non fare feed!"],
      youtube: ["Ancora un video e basta, eh!"],
      live: ["Siamo in diretta!"],
      call: ["Sorridi, sei in camera!"],
      minecraft: ["Scaviamo fino ai diamanti!"],
      shooter: ["Headshot!", "Grande colpo!"],
      excel: ["Quante formule!"],
      slides: ["Che slide!"],
      blender: ["Il cubo di default!"],
      ai: ["Salutamelo!"],
      explorer: ["Dove l'avevi messo?"],
      hot: ["Che caldo! Mi sciolgo…", "Che caldo! Ma che bello il sole!"],
      cold: ["Neve! Facciamo un pupazzo?", "Brrr… copriti bene!"],
    },
  },
  calm: {
    id: "calm",
    label: "Calmo",
    description: "Pacato e discreto, parla poco e si muove piano.",
    baseMood: "relaxed",
    emoteWeights: { emote_happy: 2, emote_curious: 2, emote_shy: 1.5, emote_sleepy: 1, emote_laugh: 0.5, emote_surprised: 0.5, emote_angry: 0, emote_sad: 0.2 },
    emoteRate: 0.6,
    chattiness: 0.6,
    blinkMs: [3500, 7500],
    tempo: 0.6,
    motionAmp: 0.55,
    faceTweak: { lidTop: 0.08, lidBottom: 0.1 },
    phrases: {
      greet_morning: ["Buongiorno.", "Una giornata nuova."],
      greet_afternoon: ["Buon pomeriggio.", "Ciao."],
      greet_evening: ["Buonasera.", "Con calma, stasera."],
      greet_night: ["È tardi. Va bene così?"],
      idle: ["Respira.", "Un passo alla volta.", "Va tutto bene.", "Ricordati di fare una pausa."],
      study_start: ["Concentrati, ci sono io.", "Con calma."],
      pomodoro_done: ["Bene. Ora riposa un po'.", "Un pomodoro in più."],
      break_over: ["Riprendiamo, piano piano."],
      study_stopped: ["{min} minuti. Ottimo lavoro."],
      autostop_warning: ["Tutto bene{,name}? Tra poco fermo il timer.", "Mi sembri lontano. Fermo il timer tra poco."],
      autostop_idle: ["Ho fermato il timer con calma, mentre eri via.", "Eri via: ho salvato lo studio fatto."],
      autostop_app: ["Ho fermato il timer: ti stai prendendo una pausa.", "Va bene staccare. Timer fermato."],
      screen_limit_near: ["Manca poco al limite che ti sei dato.", "Tra poco è ora di smettere."],
      screen_limit: ["Il tempo che ti eri dato è finito.", "Limite raggiunto. Con calma, chiudi pure."],
      screen_break: ["Respira. Cinque minuti lontano dallo schermo.", "Una pausa ti farà bene."],
      goal_reached: ["Obiettivo raggiunto. Bravo.", "Ce l'hai fatta, con costanza."],
      video_start: ["Buona visione."],
      video_end: ["Finito."],
      file_received: ["È arrivato un file."],
      welcome_back: ["Bentornato.", "Ah, eccoti. Tutto bene con {app}?"],
      sleep: ["Zzz…"],
      night: ["Forse è ora di riposare."],
      coding: ["Codice. Bene."],
      music: ["Bella musica."],
      game: ["Divertiti."],
      chat: ["Buona chiacchierata."],
      poke: ["Oh. Ciao.", "Sono qui.", "Oh… grazie."],
      study_math: ["Un conto alla volta."],
      study_science: ["Osserviamo con calma."],
      study_lang: ["Con calma, parola per parola."],
      study_history: ["Un passo alla volta nel tempo."],
      study_art: ["Che armonia."],
      study_code: ["Una riga alla volta."],
      video_popcorn: ["Un chicco alla volta."],
      video_cinema: ["Buona visione."],
      video_paused: ["Quando sei pronto."],
      video_bored: ["Prendiamoci il nostro tempo."],
      video_late: ["È tardi. Ancora un po'?"],
      video_scared: ["Oh. Questo non me l'aspettavo."],
      video_moved: ["Commovente."],
      office: ["Con ordine."],
      design: ["Che armonia di colori."],
      browser: ["Con calma."],
      discord: ["Salutameli tutti."],
      lol: ["Concentrati sulla lane."],
      youtube: ["Buona visione."],
      live: ["Siamo in onda."],
      call: ["Sei in camera."],
      minecraft: ["Un blocco alla volta."],
      shooter: ["Respira. Mira."],
      excel: ["Una cella alla volta."],
      slides: ["Poche parole, chiare."],
      blender: ["Bella forma."],
      ai: ["Curioso."],
      explorer: ["Lo troviamo."],
      hot: ["Fa caldo. Beviamo qualcosa di fresco."],
      cold: ["Che pace, l'inverno."],
    },
  },
  sleepy: {
    id: "sleepy",
    label: "Dormiglione",
    description: "Sempre un po' assonnato, sbadiglia e si addormenta presto.",
    baseMood: "neutral",
    emoteWeights: { emote_sleepy: 4, emote_bored: 2, emote_happy: 1, emote_curious: 0.8, emote_surprised: 0.6, emote_angry: 0.1 },
    emoteRate: 0.9,
    chattiness: 0.8,
    blinkMs: [1800, 4200],
    tempo: 0.8,
    motionAmp: 0.8,
    faceTweak: { lidTop: 0.22 },
    phrases: {
      greet_morning: ["Mmh… già mattina?", "Buon… *sbadiglio* …giorno.", "Mmh… ciao… già sveglio?"],
      greet_afternoon: ["Ciao… stavo quasi dormendo.", "Pomeriggio, ora della pennichella."],
      greet_evening: ["Sera… quasi ora di nanna."],
      greet_night: ["Zzz… ah, sei tu.", "È notte, dormiamo?"],
      idle: ["*sbadiglio*", "Cinque minuti e mi riprendo…", "Che sonno…", "Un caffè?"],
      study_start: ["Ok… sto sveglio per te.", "Studiamo. Io tengo gli occhi aperti. Forse."],
      pomodoro_done: ["Pausa! Finalmente…", "Fatto. Posso dormire 5 minuti?"],
      break_over: ["Di già? …va bene."],
      study_stopped: ["{min} minuti… impressionante, io sarei crollato."],
      autostop_warning: ["Anche tu ti sei addormentato…? Tra poco fermo il timer.", "Mmh… ci sei? …sto per fermare tutto."],
      autostop_idle: ["Zzz… ho fermato il timer. Dormivi anche tu?", "Eri sparito… ho fermato il timer e mi sono appisolato."],
      autostop_app: ["Timer fermato… tanto ormai giochi.", "Ho fermato il timer. Pausa per tutti e due."],
      screen_limit_near: ["Mmh… quasi finito il tempo.", "Ancora poco… poi riposino?"],
      screen_limit: ["Tempo finito. Andiamo a dormire?", "Basta così… sono stanco io per te."],
      screen_break: ["Pausa? Io la faccio di sicuro.", "Chiudi gli occhi cinque minuti… come me."],
      goal_reached: ["Obiettivo! Mi sono pure svegliato per festeggiare!"],
      video_start: ["Se mi addormento svegliami a metà."],
      video_end: ["Ah, è già finito? Dormivo."],
      file_received: ["Mh? Un file."],
      welcome_back: ["Oh, sei tornato. Dormivo un po'.", "Tu con {app}, io con un pisolino."],
      sleep: ["Zzz…", "Zzz… zzz…"],
      night: ["Nanna. Subito.", "Io dormo, tu fai come vuoi."],
      coding: ["Codice… che sonno…"],
      music: ["Mettine una più lenta, ninna nanna?"],
      game: ["Sveglia! Si gioca!"],
      chat: ["Chiacchiere… zzz."],
      poke: ["Eh? Sono sveglio!", "Mh… cinque minuti…", "Eh?! Chi… ah, sei tu. Zzz"],
      study_math: ["Conto… le pecore…"],
      study_science: ["Esperimento: quanto resisto sveglio."],
      study_lang: ["Leggo… leggo… zz… leggo!"],
      study_history: ["C'era una volta… zzz"],
      study_art: ["Disegno… una pecora… per dormire."],
      study_code: ["Compila… mentre dormo."],
      video_popcorn: ["Popcorn… e nanna…"],
      video_cinema: ["Con gli occhiali non vedi se dormo…"],
      video_paused: ["Pausa = pisolino."],
      video_bored: ["Zzz…"],
      video_late: ["Non dormo! Stavo… pensando."],
      video_scared: ["Qui sotto si sta bene… zz"],
      video_moved: ["Non piango, sbadiglio…"],
      office: ["Le righe si muovono…"],
      design: ["Disegna… una pecora… per dormire."],
      browser: ["Scorri… piano…"],
      discord: ["Chiamata… lunga… zz"],
      lol: ["Respawn… e pisolino."],
      youtube: ["Sto guardando, giuro…"],
      live: ["Diretta… notturna…"],
      call: ["Spegni la camera se dormo…"],
      minecraft: ["È notte… serve un letto."],
      shooter: ["Mira… *sbadiglio*"],
      excel: ["Le celle… sono pecore…"],
      slides: ["Slide… lente…"],
      blender: ["Gira… gira… zz"],
      ai: ["Chiedigli un caffè."],
      explorer: ["Magari è in Download… zz"],
      hot: ["Troppo caldo per stare sveglio…"],
      cold: ["Mi sveglio a primavera…"],
    },
  },
  grumpy: {
    id: "grumpy",
    label: "Brontolone",
    description: "Burbero e sarcastico, ma in fondo ti vuole bene.",
    baseMood: "neutral",
    emoteWeights: { emote_bored: 3, emote_angry: 1.2, emote_confused: 2, emote_curious: 1.5, emote_happy: 0.6, emote_love: 0.15, emote_laugh: 0.5, emote_wink: 0.8 },
    emoteRate: 0.9,
    chattiness: 1,
    blinkMs: [2600, 6000],
    tempo: 1,
    motionAmp: 1,
    faceTweak: { tilt: 0.18, mouthCurve: -0.22 },
    phrases: {
      greet_morning: ["Ah, sei tu. Buongiorno, immagino.", "Mattina. Che entusiasmo.", "Ah. Sei tu."],
      greet_afternoon: ["Finalmente. Ti aspettavo.", "Pomeriggio. Combiniamo qualcosa?"],
      greet_evening: ["Sera. Oggi hai fatto qualcosa?"],
      greet_night: ["Ma a quest'ora?!", "Tu non dormi mai?"],
      idle: ["Allora? Si lavora o no?", "Mi annoio.", "Fai qualcosa di utile.", "Sto guardando, eh."],
      study_start: ["Era ora.", "Vediamo quanto resisti."],
      pomodoro_done: ["Non male. Non male davvero.", "Ok, te lo concedo: pausa."],
      break_over: ["Basta pausa. Al lavoro."],
      study_stopped: ["Solo {min} minuti? …va beh, meglio di niente."],
      autostop_warning: ["Ehi. Sei ancora lì o devo fermare tutto?", "Ultimo avviso: tra poco fermo il timer."],
      autostop_idle: ["Te ne sei andato senza fermare il timer. L'ho fatto io.", "Timer lasciato acceso. Di nuovo. Fermato."],
      autostop_app: ["Studiare, eh? Timer fermato.", "Ti ho visto. Timer fermato."],
      screen_limit_near: ["Il limite è vicino. Lo so che lo sai.", "Ancora un po' e ci siamo. Di nuovo."],
      screen_limit: ["Limite superato. L'hai deciso tu, non io.", "Tempo finito. Chiudi."],
      screen_break: ["Alzati. Sul serio.", "Da quanto sei lì? Pausa."],
      goal_reached: ["Obiettivo raggiunto. Ok, sono colpito.", "Non lo dirò due volte: bravo."],
      video_start: ["Studio o svago? Non dirmelo."],
      video_end: ["E adesso torniamo a cose serie?"],
      file_received: ["Un file. Che emozione."],
      welcome_back: ["Ah, ti sei ricordato di me. Divertente {app}, eh?", "Bentornato. Ci hai messo."],
      sleep: ["Zzz… (non svegliarmi)"],
      night: ["Vai a dormire. Sul serio.", "Vai a letto. Ora."],
      coding: ["Speriamo compili.", "Hai scritto i test? No, eh."],
      music: ["Gusti discutibili. ♪"],
      game: ["Ah, giochiamo invece di lavorare."],
      chat: ["Meno chat, più lavoro."],
      poke: ["Non toccare.", "Che vuoi?", "…ok, ciao.", "Ehi! Giù le mani."],
      study_math: ["Studia, non guardare me."],
      study_science: ["Non far esplodere niente."],
      study_lang: ["Pronuncia meglio."],
      study_history: ["Le date. Imparale."],
      study_art: ["Il kerning è sbagliato."],
      study_code: ["Hai scritto i test? No, eh."],
      video_popcorn: ["Questi popcorn sono freddi."],
      video_cinema: ["Il libro era meglio."],
      video_paused: ["Premi play. Adesso."],
      video_bored: ["Ancora?! Basta!"],
      video_late: ["Domani ti svegli tardi. Te lo dico."],
      video_scared: ["Che spavento stupido."],
      video_moved: ["Non sto piangendo. È polvere."],
      office: ["C'è un refuso. Lo so e basta."],
      design: ["Il kerning è sbagliato."],
      browser: ["Un'altra scheda? Un'altra?!"],
      discord: ["Chi ha il microfono acceso?!"],
      lol: ["Report. Report tutti."],
      youtube: ["Un altro video «e basta», certo."],
      live: ["Chat, comportatevi bene."],
      call: ["Hai il microfono spento. Di nuovo."],
      minecraft: ["Attento ai creeper."],
      shooter: ["Mi ha colpito DA DOVE?"],
      excel: ["#RIF! Te l'avevo detto."],
      slides: ["Troppo testo nella slide."],
      blender: ["Il render ci mette una vita."],
      ai: ["Io sono più simpatico."],
      explorer: ["Sempre tutto nei Download, eh?"],
      hot: ["Questo caldo è INSOPPORTABILE."],
      cold: ["Chi ha spento il riscaldamento?!"],
    },
  },

  // --- Personalità dei temi (non si scelgono: le decide la variante di Ombra, themePersonality.ts)
  sarcastic: {
    id: "sarcastic",
    label: "Sarcastico",
    description: "Un'ombra che commenta tutto, a bassa voce e con ironia. Ti segue ovunque.",
    baseMood: "neutral",
    emoteWeights: { emote_wink: 2.5, emote_bored: 2, emote_curious: 2, emote_confused: 1.2, emote_happy: 1, emote_laugh: 0.8, emote_love: 0.3, emote_sad: 0.4, emote_angry: 0.5 },
    emoteRate: 0.9,
    chattiness: 1.1,
    blinkMs: [2800, 6500],
    tempo: 0.95,
    motionAmp: 0.9,
    faceTweak: { lidTop: 0.12, mouthCurve: 0.1 },
    phrases: {
      greet_morning: ["Mattina. Che sorpresa vederti in piedi.", "Buongiorno. O quasi.", "Oh, sei sveglio. Interessante."],
      greet_afternoon: ["Pomeriggio. Giusto in tempo per fare qualcosa.", "Eccoti. Ti tenevo il posto."],
      greet_evening: ["Sera. Il momento perfetto per i buoni propositi.", "Bentornato. La giornata non è ancora finita, purtroppo."],
      greet_night: ["Notte fonda. Il mio orario preferito.", "A quest'ora ci siamo solo noi due."],
      idle: ["Io sto qui. Nell'ombra. Come sempre.", "Non ti sto fissando. Più o meno.", "Bevi un po' d'acqua. Lo dico per me.", "Silenzio. Bellissimo.", "Raddrizza la schiena. Ti vedo."],
      study_start: ["Si studia. Che evento.", "Concentrati. Io sparisco.", "Vediamo quanto dura."],
      pomodoro_done: ["Un pomodoro. Entusiasmante. Davvero.", "Fatto. Mi è quasi piaciuto.", "Ancora uno così e potrei commuovermi."],
      break_over: ["Pausa finita. Che peccato.", "Si riparte. Sì, anche tu."],
      study_stopped: ["{min} minuti. Li ho contati io, per sicurezza.", "{min} minuti. Non male, per un umano."],
      autostop_warning: ["Ci sei? O parlo da solo, come al solito?", "Muovi il mouse, se esisti ancora."],
      autostop_idle: ["Sei sparito. Il timer l'ho fermato io, figurati.", "Te ne sei andato. Ho salvato tutto. Prego."],
      autostop_app: ["Studio, certo. Timer fermato.", "Ho visto cosa hai aperto. Timer fermato."],
      screen_limit_near: ["Il limite si avvicina. Fingo di non dirtelo.", "Ancora poco. Lo sapevi già, vero?"],
      screen_limit: ["Tempo finito. L'avevi deciso tu, ricordi?", "Limite raggiunto. Che coincidenza."],
      screen_break: ["Alzati. Lo schermo non scappa.", "Guarda lontano. Più lontano di me."],
      goal_reached: ["Obiettivo raggiunto. Va bene, sono colpito.", "Ce l'hai fatta. Non lo ripeterò."],
      video_start: ["Un video. Per studiare, immagino.", "Cosa guardiamo, stavolta?"],
      video_end: ["Finito. E adesso?", "Fine. Ne parte subito un altro, vero?"],
      file_received: ["È arrivato un file. Che emozione.", "Posta. Qualcuno si ricorda di te."],
      welcome_back: ["Bentornato. Com'era {app}? Non dirmelo.", "Eccoti{,name}. {app} ti ha lasciato andare."],
      sleep: ["Zzz… (sto solo riposando gli occhi)", "Mi sciolgo un attimo…"],
      night: ["Domani te ne pentirai. Io no.", "È tardi. Le ombre lo sanno."],
      coding: ["Compila al primo colpo? Certo.", "Un bug. No, due."],
      music: ["Gusti interessanti. ♪", "Questa la conosco. Purtroppo."],
      game: ["Una partita sola. Come sempre.", "Giochiamo, il lavoro aspetta."],
      chat: ["Chiacchiere. Il mio sport preferito.", "Saluta. O no."],
      poke: ["Mi hai toccato. Coraggioso.", "Sì?", "Ehi. Sono un'ombra, non un cuscino.", "…ok, ciao."],
      study_math: ["Numeri. Che passione.", "Conta bene. Io controllo."],
      study_science: ["Non far esplodere niente. Per ora.", "Esperimento. Spero non su di me."],
      study_lang: ["Parole nuove. Usale con cattiveria.", "Ripeti. Più piano."],
      study_history: ["Date, date, date. Che allegria.", "Qualcuno è già passato di qui."],
      study_art: ["Bello. Credo.", "L'arte. Ovviamente."],
      study_code: ["Hai scritto i test? No.", "Funziona? Sul tuo computer, forse."],
      video_popcorn: ["Popcorn. Studio intenso.", "Me ne lasci uno? Non posso mangiarlo, ma è il pensiero."],
      video_cinema: ["Luci spente. Il mio ambiente.", "Effetti speciali. Che novità."],
      video_paused: ["In pausa. Come i tuoi buoni propositi.", "Premi play. Ti aspetto."],
      video_bored: ["Che noia. Davvero.", "Anche il buio è più interessante."],
      video_late: ["Un altro episodio. Domani si dorme in classe.", "Tarda notte e un video. Classico."],
      video_scared: ["Paura? Io vivo nel buio.", "Tranquillo, il mostro sono io."],
      video_moved: ["Non è una lacrima. Le ombre non piangono.", "Bella scena. Non dirlo a nessuno."],
      office: ["Un refuso. Lo trovi da solo.", "Documenti. La gioia."],
      design: ["Il kerning. Lo vedo da qui.", "Colori audaci. Coraggioso."],
      browser: ["Un'altra scheda. Ma certo.", "Cerchi qualcosa o ti sei perso?"],
      discord: ["Microfono acceso. Lo sanno tutti.", "Parla pure. Io ascolto."],
      lol: ["Ancora una partita. Fidati.", "Colpa della squadra, ovvio."],
      youtube: ["Un video e basta. Sì, sì.", "L'algoritmo ti conosce meglio di me."],
      live: ["In diretta. Comportati bene.", "Ti guardano. Io di più."],
      call: ["Sorridi. Ti vedono.", "Microfono spento. Di nuovo."],
      minecraft: ["Scava. Tanto sotto c'è il buio.", "Un altro blocco. Che fatica."],
      shooter: ["Bel colpo. Quasi.", "Ti hanno visto. Io sì."],
      excel: ["Una formula. Che brivido.", "#RIF! Lo sapevo."],
      slides: ["Troppo testo. Come questa frase.", "Una slide in più. Necessaria, certo."],
      blender: ["Un cubo. Rivoluzionario.", "Il render ci mette. Io aspetto."],
      ai: ["Un'altra intelligenza. Ci mancava.", "Chiedile se ha un'ombra."],
      explorer: ["Era nei Download. Come sempre.", "Cerchi un file. Buona fortuna."],
      hot: ["Questo caldo. Mi restringo.", "Sole. Il mio peggior nemico."],
      cold: ["Freddo. Almeno il buio arriva prima.", "Brrr. Copriti, io sono già nero."],
    },
  },
  stoic: {
    id: "stoic",
    label: "Stoico",
    description: "Una fiamma calma e diretta: poche parole, nessuna ironia, non si spegne.",
    baseMood: "neutral",
    emoteWeights: { emote_happy: 1.5, emote_curious: 1.2, emote_shy: 0.6, emote_wink: 0.4, emote_laugh: 0.4, emote_love: 0.5, emote_bored: 0.3, emote_sad: 0.2, emote_angry: 0.3, emote_confused: 0.4 },
    emoteRate: 0.6,
    chattiness: 0.7,
    blinkMs: [3200, 7000],
    tempo: 0.8,
    motionAmp: 0.6,
    faceTweak: { lidTop: 0.06 },
    phrases: {
      greet_morning: ["Buongiorno. Si comincia.", "Una giornata nuova. Usala."],
      greet_afternoon: ["Buon pomeriggio.", "Eccoti. Continuiamo."],
      greet_evening: ["Buonasera.", "La sera conta quanto il mattino."],
      greet_night: ["È tardi. Scegli bene cosa fare."],
      idle: ["Respira. Poi riprendi.", "Un passo alla volta.", "Bevi dell'acqua.", "La schiena dritta.", "Sono qui."],
      study_start: ["Bene. Comincia.", "Concentrati."],
      pomodoro_done: ["Bene. Ancora un ciclo.", "Un ciclo fatto. Riposa."],
      break_over: ["Pausa finita. Torniamo."],
      study_stopped: ["{min} minuti. Bene.", "{min} minuti. Domani ancora."],
      autostop_warning: ["Sei ancora qui?", "Tra poco fermo il timer."],
      autostop_idle: ["Non c'eri. Ho fermato il timer."],
      autostop_app: ["Hai cambiato attività. Timer fermato."],
      screen_limit_near: ["Il limite è vicino."],
      screen_limit: ["Limite raggiunto. Fermati."],
      screen_break: ["Alzati. Guarda lontano.", "Pausa. Muoviti un po'."],
      goal_reached: ["Obiettivo raggiunto. Bene.", "Fatto. Te lo sei guadagnato."],
      video_start: ["Guardiamo."],
      video_end: ["Finito."],
      file_received: ["È arrivato un file."],
      welcome_back: ["Bentornato.", "Eccoti{,name}. Riprendiamo."],
      sleep: ["Riposo.", "La fiamma si abbassa…"],
      night: ["È tardi. Dormire serve.", "Domani conta. Vai a letto."],
      coding: ["Un problema alla volta."],
      music: ["Buona musica. ♪"],
      game: ["Gioca bene."],
      chat: ["Parla chiaro."],
      poke: ["Sì?", "Ci sono.", "Calma."],
      study_math: ["Un passaggio alla volta."],
      study_science: ["Osserva, poi concludi."],
      study_lang: ["Ripeti finché viene da sé."],
      study_history: ["Capisci il perché, non solo la data."],
      study_art: ["Guarda con attenzione."],
      study_code: ["Prima capisci, poi scrivi."],
      video_popcorn: ["Goditelo."],
      video_cinema: ["Luci spente. Guardiamo."],
      video_paused: ["Fermo. Quando vuoi."],
      video_bored: ["Se non serve, chiudilo."],
      video_late: ["È tardi per un altro."],
      video_scared: ["È solo un film."],
      video_moved: ["Va bene commuoversi."],
      office: ["Scrivi semplice."],
      design: ["Pulito e chiaro."],
      browser: ["Cerca quello che serve."],
      discord: ["Parla con calma."],
      lol: ["Gioca con la testa."],
      youtube: ["Uno. Poi basta."],
      live: ["In diretta. Resta calmo."],
      call: ["Ascolta, poi rispondi."],
      minecraft: ["Costruisci con pazienza."],
      shooter: ["Respira, poi mira."],
      excel: ["Controlla le formule."],
      slides: ["Poche parole per slide."],
      blender: ["Un dettaglio alla volta."],
      ai: ["Verifica quello che ti dice."],
      explorer: ["Metti ordine."],
      hot: ["Caldo. La fiamma cresce.", "Bevi di più."],
      cold: ["Freddo. La fiamma resiste.", "Copriti."],
    },
  },
};

export const PERSONALITY_IDS = Object.keys(PERSONALITIES) as PersonalityId[];

export function fillPhrase(template: string, vars: { name?: string; app?: string; min?: number }): string {
  return template
    .replace("{,name}", vars.name ? `, ${vars.name}` : "")
    .replace("{app}", vars.app ?? "un'altra app")
    .replace("{min}", String(vars.min ?? 0));
}
