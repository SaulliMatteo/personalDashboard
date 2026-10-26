# Mockup approvati: Gruppi

Fonte di verità per la grafica della funzione Gruppi (vedi `docs/GRUPPI.md`, Fase 5).
Ogni file è una schermata e contiene **tutte le 8 versioni**: 4 temi × versione chiara e scura.
Si sceglie la versione dal selettore in basso a destra, oppure dall'indirizzo:
`stanza-comune.html#tema=opaco&modo=notte` (`tema` = notte | opaco | quaderno | fosforo, `modo` = giorno | notte).

| File | Schermata |
|---|---|
| `stanza-comune.html` | Stanza comune (voce della barra laterale): la sala studio con le sale da 8 posti, il pannello dei dettagli e "Fuori dalla stanza". Il timer scorre, i gruppi e le sale si cambiano, i posti si selezionano. |
| `impostazioni-stanza.html` | Impostazioni della stanza (= dettaglio del widget, apribile anche dalla Stanza comune). |
| `widget.html` | Widget Gruppi nelle taglie 1×1, M (classifica oggi/settimana) e L (classifica + segnaposto "Messaggi", fuori dalla v1). |
| `finestre.html` | Scelta del nome utente, Crea un gruppo, Entra con un codice (mostrata nello stato di errore). |
| `primo-accesso.html` | Stanza comune senza account: "Accedi con Google" e cosa viene condiviso. |
| `stati.html` | Accesso in corso nel browser, nessun gruppo, gruppi non raggiungibili. |

## Regole per l'implementazione

- **Tutte e 8 le versioni sono obbligatorie.** La sala è un disegno diverso per tema, non solo colori:
  Notte illustrazione notturna, Opaco blocchi di pigmento senza contorni, Quaderno penna sul foglio a quadretti con la
  luce a evidenziatore, Fosforo matrice di LED con lo studio in LED rosso. Cambia anche tra chiaro e scuro dello stesso
  tema. Si realizza con `useThemeVariant(map)`, mai con `if (theme === …)`.
- **Colori solo dai token.** I valori nei mockup vengono da `src/styles/tokens.css` e `tokens-varianti.css`; quelli
  nuovi della sala vanno aggiunti come token in **entrambi** i file.
- **Font.** I mockup li caricano da Google Fonts solo per comodità: nell'app si usano i pacchetti `@fontsource` locali
  (regola "nessuna risorsa da internet").
- **Pigmento in Opaco.** I mockup usano "blu" per la sala e il widget e "carta" per le impostazioni: nell'app decide
  `pigmentFor` del registry.
- **Pixy.** Le facce nella sala sono semplificate (studia, pausa); come renderle nell'app si decide in Fase 5 (un widget
  non può importare il Companion).
- **Stato mai affidato solo al colore**: c'è sempre il testo del timer o "pausa", e ogni posto occupato è un
  `<button>` con `aria-label`.
- Nomi, tempi e codici sono inventati.
- Il piccolo motore JavaScript in fondo a ogni file serve solo a mostrare il mockup: **non va riusato nell'app**.
