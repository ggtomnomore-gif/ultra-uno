# API UNO ULTRA

Base URL locale: `http://localhost:3000`. Le API JSON accettano e restituiscono
`application/json`; gli endpoint protetti richiedono
`Authorization: Bearer <JWT>`. Il token JWT dura sette giorni.

## HTTP

| Metodo e percorso | Auth | Descrizione |
|---|---|---|
| `GET /health` | No | Stato del processo HTTP: `{"status":"ok"}`. Non verifica PostgreSQL o Redis. |
| `GET /ready` | No | Verifica PostgreSQL e Redis; risponde `503` se una dipendenza non è disponibile. |
| `POST /api/auth/register` | No | Crea account e statistiche iniziali per le modalità. |
| `POST /api/auth/login` | No | Autentica username e password e rilascia il JWT. |
| `GET /api/auth/me` | Sì | Restituisce profilo, MMR e rank persistenti per modalità. |
| `POST /api/auth/logout` | Sì | Revoca il JWT corrente via Redis; risponde `503` se Redis non è disponibile. |
| `GET /api/store` | Sì | Catalogo attivo in PostgreSQL, saldo V-Coins, inventario e ultime 20 transazioni. |
| `POST /api/store/purchase` | Sì | Acquista un articolo abilitato al prezzo letto dal database; operazione transazionale. |
| `POST /api/store/equip` | Sì | Equipaggia un tema acquistato oppure il tema predefinito `theme-cyber`. |
| `GET /api/battle-card` | Sì | Progressi, ricompense, stato dei riscatti e prezzi della stagione attiva. |
| `POST /api/battle-card/unlock` | Sì | Sblocca il pass premium standard o il pass con 20 livelli bonus. |
| `POST /api/battle-card/claim` | Sì | Riscatta una ricompensa gratuita o premium già sbloccata. |
| `POST /api/battle-card/claim-all` | Sì | Riscatta atomicamente tutte le ricompense già sbloccate e non ancora reclamate. |
| `GET /api/challenges` | Sì | Restituisce sfide giornaliere, progressi e stato del riscatto in UTC. |
| `POST /api/challenges/claim` | Sì | Riscatta una sfida completata e accredita V-Coins atomicamente. |

### Registrazione e accesso

`POST /api/auth/register`

```json
{
  "username": "Ada_42",
  "password": "password123"
}
```

Successo (`201`):

```json
{
  "user": { "id": "1", "username": "Ada_42", "email": null },
  "token": "<JWT>"
}
```

`POST /api/auth/login` accetta `{"username":"Ada_42","password":"password123"}` e
restituisce la stessa forma di risposta con stato `200`. Validazione fallita:
`400`; username duplicato: `409`; credenziali errate: `401`. L'email non è
richiesta per la registrazione. Le richieste di autenticazione sono limitate
per IP.

### Profilo e store

`GET /api/auth/me` restituisce `{"user":{...}}`. `GET /api/store` restituisce `credits`, `activeTheme`, `items` e `transactions`;
il catalogo esposto è letto da `store_items` e include solo articoli abilitati.

`POST /api/store/purchase`:

```json
{ "itemId": "theme-lava" }
```

Successo (`201`): `{"itemId":"theme-lava","credits":650}`. Articolo non valido:
`400`; già posseduto o crediti insufficienti: `409`.

`POST /api/store/equip` usa la stessa forma del body con `itemId`. Il server
risponde `{"itemId":"theme-lava","theme":"lava-red"}`; articolo non posseduto:
`403`. Il saldo e l'inventario persistono in PostgreSQL dopo aver eseguito
`npm run migrate`. `npm run seed` sincronizza le righe del catalogo dal file JSON
`database/seeds/shop_items.json`.

### Battle Card

La migrazione `003_battle_card.sql` crea il catalogo della stagione, i progressi
per utente e i riscatti univoci. `npm run seed` genera 100 livelli con 5
V-Coins gratuiti e 5 premium per livello. I livelli derivano dall'esperienza
registrata dal server: una partita UNO online completata assegna 100 XP a ogni
partecipante e altri 100 XP al vincitore; le partite locali non assegnano XP.
Il client non può inviare direttamente esperienza o risultati.

`POST /api/battle-card/unlock` accetta `{"tier":"standard"}` (1000 V-Coins) o
`{"tier":"boosted"}` (1500 V-Coins e 20 livelli bonus). Il pass può essere
acquistato una sola volta per stagione.

`POST /api/battle-card/claim` accetta `{"level":1,"track":"free"}` oppure
`{"level":1,"track":"premium"}`. Il riscatto premium richiede il pass attivo.
`POST /api/battle-card/claim-all` non richiede parametri e applica in una
transazione tutti i premi disponibili; il client presenta poi ciascun premio
in sequenza. I riscatti duplicati e i livelli non raggiunti vengono rifiutati.

`GET /api/challenges` restituisce l'elenco attivo con `challenge_id`, descrizione,
obiettivo, progresso, ricompensa, stato `claimed` e data UTC. Al momento sono
disponibili «Prima partita» (1 match, 50 V), «Sempre in gioco» (3 match, 150 V)
e «Vittoria del giorno» (1 vittoria, 100 V). Solo le partite UNO online concluse
dal server avanzano i contatori.

`POST /api/challenges/claim` accetta `{"challengeId":"uno-first-match"}`.
L'accredito è transazionale e il riscatto è limitato a una volta per utente,
sfida e giorno UTC; una sfida incompleta o già riscattata restituisce `409`.

## WebSocket

Connessione a `ws://localhost:3000/ws` (produzione HTTPS: `wss://.../ws`).
Il client invia il JWT nel primo frame dopo l'apertura del WebSocket, non
nell'URL:

```json
{ "type": "auth", "payload": { "token": "<JWT>" } }
```

La risposta `auth.ok` identifica l'account. Ogni messaggio successivo segue la
forma `{"type":"...","payload":{...}}`.

| Evento client | Payload | Regola |
|---|---|---|
| `room.create` | `{}` | Crea stanza; il creatore ne è host. |
| `room.join` | `{"roomId":"A1B2C3D4"}` | Entra in una stanza aperta; massimo quattro account. |
| `matchmaking.queue` | `{}` | Cerca un avversario UNO ranked; richiede un account con statistiche persistenti. |
| `matchmaking.cancel` | `{}` | Annulla la ricerca ranked ancora in coda. |
| `room.leave` | `{}` | Abbandona la stanza; se esce l'host la stanza viene chiusa. |
| `game.start` | `{"mode":"uno"}` | Solo l'host; il server avvia UNO Classic quando ci sono almeno due giocatori. |
| `game.action` | `{"action":{"type":"draw"}}` | Azione del giocatore autenticato; il server verifica turno e regole. |

Un ping WebSocket inviato dal server ogni 30 secondi mantiene viva la
connessione dietro Nginx e verifica i client ancora raggiungibili. Redis
controlla la revoca del JWT anche durante l'autenticazione WebSocket; se Redis
non è disponibile il server rifiuta la connessione.

Le altre azioni UNO sono `{"type":"pass"}` e
`{"type":"play","cardId":"...","color":"red"}`. Una carta jolly richiede il
colore `red`, `blue`, `green` o `yellow`. Le mosse fuori turno, le carte non
giocabili, i passaggi non consentiti e le azioni malformate ricevono un evento
`error`.

Il server invia `matchmaking.queued` durante la ricerca, quindi
`matchmaking.found` quando trova un avversario; `matchmaking.cancelled`
conferma l'annullamento. La coda abbina due account in base all'MMR più vicino
entro 300 punti, ampliando l'intervallo di 100 punti ogni 30 secondi fino a
1000. Le stanze create con `room.create` o raggiunte con
`room.join` sono casual e non cambiano la classifica.

Il server invia `room.created`, `room.joined`, `room.playerJoined`,
`room.playerLeft`, `room.closed` e `game.state`. Ogni `game.state` ha un numero
`version`; lo stato pubblico contiene solo conteggi delle mani e segnaposto del
mazzo. La proprietà `privateHand` contiene la mano dell'account destinatario.
Il server rifiuta l'evento client `game.state` (`SERVER_AUTHORITY`): i client
non possono creare né sovrascrivere lo stato della partita.

Quando una partita UNO ranked termina, il server aggiorna atomicamente MMR,
rank, partite e vittorie per entrambi i partecipanti. Le partite online casual
aggiornano progressi Battle Card e Sfide, senza modificare MMR o statistiche
ranked. Il profilo aggiornato, inclusi rank, MMR, partite e vittorie per
modalità, è leggibile con `GET /api/auth/me`; la lobby lo ricarica quando si
rientra dalla partita.

## Fuori ambito attuale

Non sono ancora disponibili riconnessione, API per amici, leaderboard o
tornei. Per lo stato di ciascuna modalità consultare
[`PROJECT_STATUS.md`](PROJECT_STATUS.md). `GET /health` controlla il processo;
`GET /ready` verifica anche PostgreSQL e Redis.
