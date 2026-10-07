# UNO ULTRA

Piattaforma UNO ULTRA, in sviluppo: interfaccia web vanilla, server Express,
account con JWT e PostgreSQL, calcolo MMR locale e partite locali di UNO contro
bot, BlackJack contro il banco, Scopa, Ruba Mazzetto, Scala 40, Poker Texas e
Millemiglia in modalità hot-seat per due giocatori.

## Requisiti e avvio

- Node.js 20 o successivo
- PostgreSQL 15

1. Copia `.env.example` in `.env` e imposta password PostgreSQL e un `JWT_SECRET`
   casuale di almeno 32 caratteri.
2. Con Docker installato, avvia PostgreSQL 15, Redis 7, il server e Nginx:

```sh
docker compose up --build -d
```

Apri `http://localhost:8080`. Per l'avvio locale alternativo, crea prima un
database PostgreSQL 15, configura il `DATABASE_URL` in `.env`, quindi esegui
questi comandi da PowerShell nella cartella `uno-ultra`:

```powershell
npm install
npm run migrate
npm run seed
npm start
```

`npm run seed` ripristina in modo idempotente il catalogo Negozio da
`database/seeds/shop_items.json` e la stagione Battle Card da
`database/seeds/battle_card_rewards.json`; esegui prima `npm run migrate`.
Le tre Sfide giornaliere sono definite dalla migrazione `004_daily_challenges.sql`;
`npm run seed` non modifica il catalogo delle Sfide.

`GET /health` verifica che il processo HTTP sia attivo; `GET /ready` verifica
anche la connessione al database e restituisce HTTP 503 se PostgreSQL non è
raggiungibile. La registrazione, l'accesso e il profilo autenticato sono
disponibili su `/api/auth/register`, `/api/auth/login` e `/api/auth/me`.
La registrazione inizializza le statistiche di tutte le otto modalità in una
transazione e salva la password con bcrypt. I token scadono dopo sette giorni.
Per ripristinare un database non eseguire la cancellazione:
modifiche strutturali future vanno aggiunte come nuove migrazioni numerate.
Per abilitare il Negozio e la V-Card applica anche le migrazioni aggiornate con
`npm run migrate`.

Se PostgreSQL non è disponibile, accesso e registrazione restituiscono un errore
esplicito. Per avviare l'intero stack locale con Docker usa
`docker compose up --build -d`; in alternativa avvia PostgreSQL 15, applica
`npm run migrate` e poi `npm start`. Nel frattempo è possibile usare
la modalità ospite per giocare alle modalità locali senza account; progressi,
negozio e stanze online richiedono PostgreSQL attivo.

## Test

```powershell
npm test -- --coverage
```

Con il server già avviato, i test E2E si eseguono con:

```powershell
npm run test:e2e
```

## Funzionalità implementate e limiti attuali

- Implementati: profili e registrazione persistenti PostgreSQL, login e JWT,
  rate limiting, logout con revoca JWT via Redis, MMR ELO persistente per le
  partite UNO online completate e rank aggiornato nel profilo, stanze
  WebSocket autenticate con host,
  sincronizzazione stato/mano privata, temi, lobby e motore UNO locale contro
  tre bot, BlackJack contro il banco con hit/stand/double, Scopa e Ruba Mazzetto
  in modalità hot-seat per due giocatori. Scopa offre scelta delle prese e
  punteggio; Ruba Mazzetto permette di rubare il mazzetto con una carta del
  valore corrispondente. Scala 40 permette pesca, apertura e combinazioni; Poker
  Texas include puntate, board e showdown in heads-up. Queste modalità sono
  hot-seat e non offrono bot; Poker non applica bui, mentre Scala 40 usa
  combinazioni singole per l'apertura e non consente attacchi alle combinazioni
  altrui. Millemiglia offre pesca, marcia, distanze e imprevisti in una partita
  locale per due, senza bot. Il motore di Burraco è disponibile ma non ha ancora
  una UI di gioco. Le stanze online supportano partite UNO Classic da 2 a 4
  account, con partita e mosse validate dal server via WebSocket e carte private
  consegnate solo al proprietario. Le partite UNO online completate aggiornano
  MMR, rank, vittorie e progressione Battle Card server-side; il vincitore
  riceve XP bonus. Le Sfide giornaliere contano partite e vittorie online e
  pagano V-Coins solo tramite riscatto server-side. Non sono ancora disponibili
  matchmaking o riconnessione.
  Il Negozio offre tre temi
  acquistabili con 1000 V-Coins virtuali iniziali, mentre la V-Card mostra
  saldo, tema equipaggiato e ultime transazioni. La Battle Card offre 100
  livelli, premi gratuiti/premium in V-Coins, sblocco premium standard o con
  20 livelli bonus e riscatti singoli o sequenziali. Le partite locali non
  assegnano XP. I crediti non sono denaro reale. È pronto un wrapper client
  PeerJS, non integrato nel gameplay.
- Ancora da realizzare: Redis per la presenza, amicizie persistenti, matchmaking, integrazione
  PeerJS e delle altre modalità online nella lobby, rotazione del catalogo
  Sfide, tornei
  e replay. Docker/Nginx sono predisposti ma il deploy
  non è ancora verificato end-to-end.
- La modalità competitiva resta disabilitata finché non esiste matchmaking
  server-side.

La specifica completa e aggiornata è in [`../IMPLEMENTAZIONE.md`](../IMPLEMENTAZIONE.md).
I contratti HTTP e WebSocket sono documentati in [`docs/API.md`](docs/API.md).
Le regole e i limiti dei motori locali sono descritti in
[`docs/GAME_RULES.md`](docs/GAME_RULES.md); i controlli operativi per un futuro
deploy sono in [`docs/DEPLOY_CHECKLIST.md`](docs/DEPLOY_CHECKLIST.md).
