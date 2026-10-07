# Checklist deploy

## Preparazione

- [ ] Configurare un `JWT_SECRET` casuale di almeno 32 caratteri fuori dal
  repository.
- [ ] Scegliere password PostgreSQL sicura; verificare firewall e backup del
  volume dati.
- [ ] Verificare che DNS e terminazione TLS siano configurati prima di esporre
  l'istanza.
- [ ] Rivedere i limiti di rate, capacità e log per il carico previsto.

## Avvio

- [ ] Copiare `.env.example` in `.env`; non aggiungere `.env` al controllo
  versione.
- [ ] Avviare con `docker compose up --build -d`.
- [ ] Dopo le migrazioni, eseguire `npm run seed` per caricare il catalogo
  corrente del Negozio e i 100 livelli della Battle Card; il seeder non include
  Sfide, le cui tre definizioni vengono create dalla migrazione 004.
- [ ] Attendere che PostgreSQL, Redis e app siano healthy.
- [ ] Verificare `GET http://localhost:8080/health` tramite Nginx.
- [ ] Creare un account di prova e verificare che siano state create otto righe
  `user_stats` con MMR 200.
- [ ] Verificare logout, token revocato, stanza WebSocket e chiusura host.
- [ ] Verificare che una vittoria UNO online assegni XP Battle Card e che i
  premi riscattati aggiornino saldo e storico senza duplicazioni.
- [ ] Verificare che una partita UNO online aggiorni le Sfide UTC e che una
  ricompensa completata sia riscattabile una sola volta.
- [ ] Eseguire `npm test -- --coverage`, `npm run test:e2e` e `npm audit`.
- [ ] Verificare backup e ripristino PostgreSQL/Redis prima del traffico reale.

## Stato

Il file Docker Compose, il Dockerfile e la configurazione Nginx sono presenti,
ma questa checklist non è dichiarata verificata: nell'ambiente di sviluppo non
sono disponibili Docker e PostgreSQL. Le prove automatizzate correnti usano
mock per PostgreSQL/Redis, eccetto le prove WebSocket locali.
