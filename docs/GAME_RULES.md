# Regole implementate

## UNO

Mazzo standard di 108 carte, sette carte iniziali, corrispondenza per colore o
valore, salti, inversioni e pescate. L'inversione in duello salta il turno
avversario. Un `+2` o `+4` crea una penalità; lo stacking si può disabilitare.
Il `+4` è ammesso solo se la mano non contiene il colore attivo. Le prime carte
`salta`, `inversione` e `+2` applicano il loro effetto.
I bot usano i profili AGGR (Bronze), CONS (Silver/Gold) e STRAT
(Platinum+), con rumore casuale simmetrico, difficoltà e tempi di risposta
derivati dall'MMR. STRAT considera anche i colori assenti dalle mani
avversarie quando sceglie il colore di un jolly.

## Modalità con interfaccia giocabile

- **BlackJack:** partita locale contro il banco, con hit, stand e double; la
  seconda carta del banco resta coperta fino alla conclusione della mano.
- **Scopa:** partita locale hot-seat per due giocatori; selezione delle prese
  legali, raccolta dell'intero tavolo come scopa e riepilogo punti per scope,
  maggioranza carte, denari, settebello e primiera. Non include un bot.
- **Ruba Mazzetto:** partita locale hot-seat per due giocatori; giocare un valore
  uguale alla cima del mazzetto avversario ruba il mazzetto intero. La partita
  termina quando entrambi hanno giocato tutte le carte; vince il mazzetto più
  grande. Non include un bot.
- **Scala 40:** partita locale hot-seat per due giocatori; pesca dal mazzo o
  dallo scarto, selezione della mano, apertura con una combinazione valida da
  almeno 40 punti, ulteriori combinazioni e scarto per passare. L'apertura da
  40 usa una singola combinazione; gli attacchi alle combinazioni altrui non
  sono previsti dal motore attuale. L'interfaccia nasconde la mano al cambio
  giocatore finché non si conferma il passaggio del dispositivo. Non include
  un bot.
- **Poker Texas:** No-Limit Hold'em heads-up locale hot-seat, con puntate
  fold/check/call/raise, flop/turn/river e showdown. Le carte private sono
  nascoste durante il passaggio del dispositivo; le carte avversarie vengono
  scoperte solo allo showdown, non dopo un fold.
  Questa UI locale non applica bui e non include bot; side pot e tavoli oltre
  due giocatori restano disponibili solo nel motore, non nell'interfaccia.
- **Millemiglia:** partita hot-seat per due giocatori; pesca una carta e poi
  gioca o scarta. Le carte di marcia richiedono di aver avviato la corsa; gli
  imprevisti fermano o limitano l'avversario, mentre rimedi e sicurezze
  ripristinano la marcia o proteggono dagli attacchi. Vince chi arriva a 1000
  km. La mano resta nascosta al cambio di giocatore. Non include un bot.

## Motori aggiuntivi senza UI di partita

- **Burraco:** quattro giocatori in due coppie, due mazzi e quattro jolly,
  pesca, combinazioni, scarti e pozzetti.

Burraco resta un motore funzionale disponibile nel browser e verificato con test
unitari; non ha ancora UI di partita o matchmaking.

## Multiplayer e progressione cosmetica

- **UNO online:** stanza autenticata da 2 a 4 giocatori. L'host può chiedere al
  server di avviare una partita UNO Classic; il server crea il mazzo e mantiene
  lo stato, accetta soltanto azioni del giocatore di turno e valida mosse,
  pesca e passaggio. Lo stato pubblico non contiene le carte in mano o il mazzo
  reale: il server consegna la mano privata solo all'account proprietario.
  A fine partita il server aggiorna MMR, rank, vittorie e partite in `user_stats`;
  nei tavoli da più di due giocatori, i perdenti sono trattati come un pari
  reciproco nel calcolo Elo medio contro gli avversari. Matchmaking e
  riconnessione non sono ancora disponibili.
- **Negozio e V-Card:** account con saldo iniziale di 1000 V-Coins virtuali;
  temi cosmetici acquistabili, inventario persistente, equipaggiamento e ultime
  20 transazioni. I V-Coins non sono acquistabili con denaro e non vengono
  ancora assegnati come premio delle partite.
- **Armadietto:** mostra i temi posseduti e consente di equipaggiarli. La scelta
  aggiorna il tema attivo tramite lo stesso inventario persistente del Negozio.
- **Battle Card:** stagione persistente da 100 livelli, con 5 V-Coins gratuiti
  e 5 premium per livello. Ogni partita UNO online terminata assegna 100 XP ai
  partecipanti; il vincitore riceve altri 100 XP. Pass premium standard (1000
  V-Coins) o con 20 livelli bonus (1500 V-Coins); ogni ricompensa si riscatta
  una sola volta e il riscatto complessivo è atomico. Le partite locali non
  danno XP e gli oggetti cosmetici del tracciato non sono ancora disponibili.
