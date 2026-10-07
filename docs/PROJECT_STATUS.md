# Stato delle modalità

| Modalità | Stato | Note |
|---|---|---|
| UNO Classic | Online e locale | Stanze WebSocket da 2 a 4 account; in locale si gioca contro tre bot. |
| BlackJack | Solo locale | Contro il banco; non è connesso all'arena online. |
| Scopa | Hot-seat locale | Due giocatori sullo stesso dispositivo; nessun bot. |
| Ruba Mazzetto | Hot-seat locale | Due giocatori sullo stesso dispositivo; nessun bot. |
| Scala 40 | Hot-seat locale | Due giocatori sullo stesso dispositivo; regole ancora semplificate. |
| Poker Texas | Hot-seat locale | Due giocatori, senza bui; non è un tavolo online completo. |
| Millemiglia | Hot-seat locale | Due giocatori sullo stesso dispositivo; nessun bot. |
| Burraco | Solo motore | Motore regole disponibile, interfaccia di gioco non implementata. |

## Limiti online

- Al momento solo UNO Classic dispone di stanze online server-authoritative;
  il matchmaking non è implementato e la modalità competitiva resta disabilitata.
- Un WebSocket chiuso non può ancora essere ripreso: non esiste una procedura di
  riconnessione alla stanza o alla partita.
- In una partita incompleta un disconnesso non riceve un risultato e la partita
  non aggiorna MMR, vittorie, progressi Battle Card o Sfide. Non viene applicata
  una penalità per abbandono; questo comportamento è coerente con il
  matchmaking ancora assente e non costituisce una politica anti-abbandono
  competitiva.
- Se si disconnette l'host, la stanza viene chiusa. Non è disponibile alcun
  recupero dello stato dopo la chiusura o il riavvio del server.

## Sessioni e dati

- Il JWT dura sette giorni. Il client lo conserva in `localStorage`; un
  JavaScript in esecuzione nella pagina che venga compromessa potrebbe leggerlo.
- Il client invia il JWT WebSocket come messaggio di autenticazione dopo
  l'handshake, mai come parametro nell'URL.
- Redis verifica la revoca di sessione anche per WebSocket e fornisce finestre
  rate-limit atomiche e condivise tra istanze. Se Redis non è disponibile, le
  richieste protette e il rate limiter rifiutano la richiesta invece di
  degradare a una verifica permissiva o a contatori locali.
- Acquisti e riscatti bloccano le righe di wallet, progressi o sfide in una
  transazione PostgreSQL; i vincoli univoci impediscono riscatti duplicati.

Per regole e limitazioni complete consultare [`GAME_RULES.md`](GAME_RULES.md)
e [`API.md`](API.md).
