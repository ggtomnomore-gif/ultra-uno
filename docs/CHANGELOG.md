# Changelog

## 0.14.0

- Aggiunta la stagione Battle Card persistente da 100 livelli: seed idempotente,
  progressione XP assegnata solo dal server alle partite UNO online completate,
  pass premium standard o con 20 livelli bonus e riscatti singoli o claim-all
  transazionali con tracciatura nel portafoglio.
- Persistiti MMR, rank, partite e vittorie dopo i risultati UNO online verificati.
  Per 3–4 giocatori il calcolo Elo media il punteggio contro gli avversari e
  considera i perdenti in parità reciproca; la lobby ricarica il profilo al
  rientro dalla partita.
- Aggiunto un MVP di Sfide giornaliere UTC con contatori aggiornati dal risultato
  server-authoritative e ricompense V-Coins riscattabili una sola volta in una
  transazione con il portafoglio.
- Collegata la sezione Season Pass della lobby con progressi, ricompense,
  sblocco pass e popup sequenziale; aggiunti test unitari e Cypress per il rank
  mostrato al rientro in lobby e il riscatto delle Sfide.

## 0.13.0

- Resa ciclabile con Tab la navigazione nei dialoghi `aria-modal`: il focus
  resta nel dialogo; i passaggi hot-seat di Scala 40, Poker e Millemiglia
  portano il focus al comando di continuazione. Annullando una scelta di presa
  a Scopa o premendo Escape, il focus ritorna al controllo che l'ha aperta.
  Cypress verifica il ciclo Tab/Shift+Tab, i focus iniziali e il ripristino.

## 0.12.0

- Spostata l'autorità delle partite UNO online dal browser host al server:
  avvio e creazione della partita, validazione di turno/mosse, pesca, passaggio
  e broadcast dello stato sono server-side. Le mani e il mazzo restano privati;
  aggiunti test del flusso WebSocket reale, delle azioni fuori turno e del
  rifiuto di snapshot client. Il test Cypress di lobby/game online usa ancora
  un client di trasporto simulato.
- Il client non può più pubblicare stati arbitrari; matchmaking, riconnessione,
  persistenza MMR e supporto P2P restano fuori da questa tranche.

## 0.11.0

- Allineati i bot UNO alla specifica: profili con colori, rumore di punteggio
  ±4 e scelta del colore del jolly STRAT sensibile ai colori assenti agli
  avversari; aggiunti test per le soglie MMR e la decisione strategica.
- Aggiunto `npm run seed` per sincronizzare in modo idempotente il catalogo
  Negozio da JSON con query parametrizzate e transazione; testati commit,
  rollback e rilascio della connessione. Il catalogo API legge gli articoli
  abilitati e i prezzi dal
  database; gli acquisti/equipaggiamenti serializzano le modifiche per account.
- Aggiunta `docs/API.md` con contratti HTTP/WebSocket e `npm run seed` alla
  checklist di deploy.
- Collegate le stanze WebSocket a partite UNO Classic online da 2 a 4 giocatori:
  avvio host, mosse ospite validate/inoltrate, stato sincronizzato e mani
  private separate per account. Sono impediti ingressi dopo l'avvio.
- Aggiunti Negozio cosmetico e V-Card con catalogo di temi, saldo iniziale,
  acquisti/equipaggiamento transazionali e storico crediti.
- Collegati i pannelli Negozio, V-Card e Armadietto alla navigazione della
  lobby; l'Armadietto permette di equipaggiare i temi posseduti. Cypress verifica
  acquisto, saldo, storico, inventario ed equipaggiamento.
- Le funzioni online dichiarano i limiti attuali: autorità di partita lato host,
  nessun matchmaking, riconnessione o crediti premio per le partite.

## 0.9.0

- Aggiunta Millemiglia hot-seat per due giocatori con pesca, selezione e scarto,
  marcia, distanze, imprevisti, rimedi, carte sicurezza e obiettivo 1000 km.
- Le mani restano nascoste al passaggio del dispositivo; aggiunto test
  deterministico Cypress per marcia, attacco e handoff.

## 0.8.0

- Aggiunto Poker Texas heads-up hot-seat con carte private, piatto, puntate
  fold/check/call/raise, board flop/turn/river e showdown.
- Al cambio di giocatore la mano attiva è schermata dietro conferma esplicita;
  le carte avversarie restano coperte dopo un fold e si scoprono allo showdown.
  I limiti locali (nessun buio, bot o tavoli oltre due giocatori) sono
  documentati.
- Aggiunto test Cypress deterministico raise-call-fold con verifica privacy
  carte e assegnazione del piatto.

## 0.7.0

- Aggiunta Scala 40 hot-seat locale a due giocatori con pesca, selezione della
  mano, apertura da almeno 40 punti, combinazioni, scarto e chiusura.
- Impedito di posare l'intera mano in una combinazione, così resta sempre una
  carta da scartare e il turno può terminare correttamente.
- La mano del giocatore successivo resta nascosta dietro un passaggio esplicito
  del dispositivo; apertura tramite singola combinazione e nessun bot sono
  limiti dichiarati del motore.
- Aggiunto test Cypress per la sequenza apertura 40, scarto, passaggio e
  protezione della mano al turno successivo.

## 0.6.0

- 2026-10-03: Ruba Mazzetto viene esposto come hot-seat a due giocatori;
  l'engine non include un bot e il multiplayer partita non è ancora collegato,
  quindi la UI dichiara esplicitamente il limite invece di simulare un avversario.
- Aggiunta Ruba Mazzetto hot-seat per due giocatori: pile visibili, furto
  automatico sul valore corrispondente, passaggio turno e confronto finale.
- Cypress verifica un furto completo e il risultato vincente della mano.

## 0.5.0

- 2026-10-03: Scopa viene esposta come hot-seat a due giocatori perché non esiste
  ancora un bot Scopa o un flusso multiplayer sincronizzato.
- Aggiunta la modalità Scopa locale hot-seat per due giocatori, con scelte fra
  prese legali, raccolta scope e riepilogo del punteggio della mano.
- Verificato il flusso Scopa nel browser, inclusa la presa del settebello che
  svuota il tavolo e il passaggio del turno al secondo giocatore.
- Resi deterministici altri fixture UNO sensibili alla carta iniziale e corretto
  il calcolo del tempo di attesa bot, che riferiva una variabile fuori scope.

## 0.4.0

- Aggiunta la selezione della modalità locale fra UNO Classic e BlackJack.
- Integrata un'interfaccia BlackJack giocabile con carte del banco coperte fino
  alla conclusione, punteggio, hit, stand, double e risultati.
- Aggiunto un test Cypress deterministico che completa una mano contro il
  banco; le altre modalità restano motori senza interfaccia di gioco.

## 0.3.0

- Applicati correttamente gli effetti delle carte iniziali UNO `salta`,
  `inversione` e `+2`; aggiornati i test dei turni per non dipendere da un
  turno iniziale casuale.
- Documentati separatamente regole/limiti dei motori disponibili e checklist
  deploy, distinguendo i componenti predisposti da quelli non ancora verificati.

## 0.2.0

- Aggiunti account PostgreSQL con hash bcrypt, JWT a 7 giorni, inizializzazione
  transazionale delle statistiche per 8 modalità e limiti sulle richieste auth.
- Aggiunto calcolo locale MMR/rank e soglie dei test per auth, rate limit e
  ranking; la persistenza MMR e gli snapshot partita non sono ancora collegati.
- L'accesso e la registrazione ora richiedono un account. Il test E2E simula la
  risposta di registrazione; serve un database PostgreSQL per creare account
  reali.
- Aggiunti server WebSocket con JWT, gestione stanze e inoltro dell'hand privato
  soltanto al relativo giocatore. Il motore ELO è disponibile come servizio,
  ma non è ancora applicato ai risultati persistenti delle partite.
- Aggiunti PeerJS client, Docker Compose (PostgreSQL, Redis e app) e reverse
  proxy Nginx come basi per i moduli di deploy e P2P ancora da completare.
- Aggiunti logout e revoca JWT via Redis, con test per la scadenza del token
  revocato.
- Aggiunti motori locali semplificati per Scala 40, Ruba Mazzetto, BlackJack,
  Scopa, Poker Texas, Burraco e Millemiglia; Jest include la copertura di tutti
  i motori pubblicati.

## 0.1.0

- Prima tranche: lobby a tema neon, temi selezionabili, server Express `/health`
  e partita UNO locale contro tre bot.
- Ambiguità risolta: la richiesta di «creare la cartella uno» è stata applicata
  usando `uno-ultra/`, il nome radice esplicito nell'architettura allegata; la
  cartella di lavoro era già chiamata `uno`.
- Login/registrazione e progresso persistente non sono simulati: richiedono il
  successivo modulo PostgreSQL/JWT.
