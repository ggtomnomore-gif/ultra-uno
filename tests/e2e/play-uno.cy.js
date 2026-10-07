describe('UNO ULTRA — partita locale', () => {
  it('starts local play from the home screen without requiring an account or database', () => {
    cy.visit('/');
    cy.get('#player-name').clear().type('Tester');
    cy.get('#quick-play-button').click();
    cy.get('#lobby-screen').should('be.visible');
    cy.get('#lobby-player-name').should('have.text', 'Tester');
    cy.get('#player-session-label').should('have.text', 'OSPITE · SOLO MODALITÀ LOCALI');
    cy.get('#play-button').click();
    cy.get('#game-screen').should('be.visible');
    cy.get('#uno-board').should('be.visible');
    cy.get('#opponents .opponent').should('have.length', 3);
  });

  it('apre la lobby e avvia una partita contro i bot', () => {
    cy.visit('/');
    cy.window().should((window) => expect(window.Peer).to.be.a('function'));
    cy.window().should((window) => {
      expect(window.BlackjackEngine).to.be.an('object');
      expect(window.ScopaEngine).to.be.an('object');
      expect(window.BurracoEngine).to.be.an('object');
      expect(window.MilleEngine).to.be.an('object');
      expect(window.PokerEngine).to.be.an('object');
      expect(window.RubaMazzettoEngine).to.be.an('object');
      expect(window.Scala40Engine).to.be.an('object');
      expect(window.ScopaEngine).to.be.an('object');
    });
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 201,
      body: { user: { id: '1', username: 'Tester', email: null }, token: 'e2e-test-token' }
    });
    cy.get('#player-name').clear().type('Tester');
    cy.get('#advance-button').click();
    cy.get('#register-tab').click();
    cy.get('#register-email').should('not.exist');
    cy.get('#register-username').type('Tester');
    cy.get('#register-password').type('password123');
    cy.get('#register-form button[type="submit"]').click();
    cy.get('#lobby-player-name').should('have.text', 'Tester');
    cy.window().its('localStorage').invoke('getItem', 'uno-ultra-token').should('eq', 'e2e-test-token');
    cy.get('#play-button').click();
    cy.get('#game-screen').should('be.visible');
    cy.get('#opponents .opponent').should('have.length', 3);
    cy.get('#hand .uno-card').should('have.length.at.least', 7).and('have.length.at.most', 9);
    cy.get('#discard-pile .uno-card').should('have.length', 1);
  });

  it('impedisce di avanzare con un nome non valido', () => {
    cy.visit('/');
    cy.get('#player-name').clear().type('ab');
    cy.get('#advance-button').click();
    cy.get('#home-screen').should('be.visible');
    cy.get('#auth-screen').should('not.be.visible');
  });

  it('shows server validation errors without entering the lobby', () => {
    cy.visit('/');
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 400,
      body: { error: 'Il nome utente non è disponibile.' }
    });
    cy.get('#advance-button').click();
    cy.get('#register-tab').click();
    cy.get('#register-username').type('Tester');
    cy.get('#register-password').type('password123');
    cy.get('#register-form button[type="submit"]').click();
    cy.get('#auth-message').should('contain.text', 'non è disponibile');
    cy.get('#lobby-screen').should('not.be.visible');
  });

  it('explains account-service outages and lets players continue as a local guest', () => {
    cy.visit('/');
    cy.intercept('POST', '/api/auth/login', {
      statusCode: 503,
      body: { error: 'Accesso temporaneamente non disponibile.' }
    });
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 503,
      body: { error: 'Registrazione temporaneamente non disponibile.' }
    });
    cy.get('#player-name').clear().type('Tester');
    cy.get('#advance-button').click();
    cy.get('#login-username').type('Tester');
    cy.get('#login-password').type('password123');
    cy.get('#login-form button[type="submit"]').click();
    cy.get('#auth-message').should('contain.text', 'Verifica che PostgreSQL sia avviato');
    cy.get('#register-tab').click();
    cy.get('#register-username').type('Tester');
    cy.get('#register-password').type('password123');
    cy.get('#register-form button[type="submit"]').click();
    cy.get('#auth-message').should('contain.text', 'Verifica che PostgreSQL sia avviato');
    cy.get('#guest-play-button').click();
    cy.get('#lobby-screen').should('be.visible');
    cy.get('#lobby-player-name').should('have.text', 'Tester');
    cy.get('#player-session-label').should('have.text', 'OSPITE · SOLO MODALITÀ LOCALI');
    cy.window().its('localStorage').invoke('getItem', 'uno-ultra-token').should('be.null');
    cy.get('#play-button').click();
    cy.get('#game-screen').should('be.visible');
    cy.get('#uno-board').should('be.visible');
  });

  it('plays a complete deterministic BlackJack hand against the dealer', () => {
    cy.visit('/');
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 201,
      body: { user: { id: '1', username: 'Tester', email: null }, token: 'e2e-test-token' }
    });
    cy.get('#advance-button').click();
    cy.get('#register-tab').click();
    cy.get('#register-username').type('Tester');
    cy.get('#register-password').type('password123');
    cy.get('#register-form button[type="submit"]').click();
    cy.get('#game-mode').select('blackjack');
    cy.window().then((window) => {
      window.BlackjackEngine.createGame = () => ({
        deck: [{ rank: 2, suit: 'hearts' }],
        player: [{ rank: 10, suit: 'clubs' }, { rank: 7, suit: 'spades' }],
        dealer: [{ rank: 10, suit: 'diamonds' }, { rank: 6, suit: 'clubs' }],
        status: 'playing',
        doubled: false,
        winner: null
      });
    });
    cy.get('#play-button').click();
    cy.get('#blackjack-board').should('be.visible');
    cy.get('#uno-board').should('not.be.visible');
    cy.get('#dealer-cards .playing-card').should('have.length', 2);
    cy.get('#dealer-cards .card-back').should('exist');
    cy.get('#blackjack-hit').click();
    cy.get('#blackjack-player-cards .playing-card').should('have.length', 3);
    cy.get('#player-score').should('contain.text', '19');
    cy.get('#blackjack-stand').click();
    cy.get('#blackjack-message').should('contain.text', 'Hai battuto il banco');
    cy.get('#dealer-cards .card-back').should('not.exist');
    cy.get('#blackjack-hit').should('be.disabled');
  });

  it('plays a Scopa sweep and hands control to the second local player', () => {
    cy.visit('/');
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 201,
      body: { user: { id: '1', username: 'Tester', email: null }, token: 'e2e-test-token' }
    });
    cy.get('#advance-button').click();
    cy.get('#register-tab').click();
    cy.get('#register-username').type('Tester');
    cy.get('#register-password').type('password123');
    cy.get('#register-form button[type="submit"]').click();
    cy.get('#game-mode').select('scopa');
    cy.window().then((window) => {
      window.ScopaEngine.createGame = () => ({
        deck: [],
        players: [
          {
            name: 'Tester',
            hand: [{ id: 'played-seven', suit: 'coins', rank: 7, value: 7 }],
            captured: [],
            scopes: 0
          },
          {
            name: 'Avversario',
            hand: [{ id: 'opponent-one', suit: 'cups', rank: 1, value: 1 }],
            captured: [],
            scopes: 0
          }
        ],
        table: [{ id: 'table-seven', suit: 'cups', rank: 7, value: 7 }],
        currentPlayer: 0,
        lastCapturer: null,
        status: 'playing'
      });
    });
    cy.get('#play-button').click();
    cy.get('#scopa-board').should('be.visible');
    cy.get('#match-label').should('contain.text', '2 GIOCATORI LOCALI');
    cy.get('#scopa-hand button[aria-label="7 di denari"]').click();
    cy.get('#scopa-capture-options button').click();
    cy.get('#scopa-message').should('contain.text', 'Scopa!');
    cy.get('#scopa-table').should('contain.text', 'Tavolo libero');
    cy.get('#scopa-player-score').should('have.text', '4');
    cy.get('#turn-label').should('contain.text', 'AVVERSARIO');
    cy.get('#scopa-hand button[aria-label="Asso di coppe"]').should('have.length', 1);
  });

  it('keeps keyboard focus inside the Scopa capture dialog and restores it on cancel', () => {
    cy.visit('/');
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 201,
      body: { user: { id: '1', username: 'Tester', email: null }, token: 'e2e-test-token' }
    });
    cy.get('#advance-button').click();
    cy.get('#register-tab').click();
    cy.get('#register-username').type('Tester');
    cy.get('#register-password').type('password123');
    cy.get('#register-form button[type="submit"]').click();
    cy.get('#game-mode').select('scopa');
    cy.window().then((window) => {
      window.ScopaEngine.createGame = () => ({
        deck: [],
        players: [
          {
            name: 'Tester',
            hand: [{ id: 'played-seven', suit: 'coins', rank: 7, value: 7 }],
            captured: [],
            scopes: 0
          },
          {
            name: 'Avversario',
            hand: [{ id: 'opponent-one', suit: 'cups', rank: 1, value: 1 }],
            captured: [],
            scopes: 0
          }
        ],
        table: [
          { id: 'table-seven', suit: 'cups', rank: 7, value: 7 },
          { id: 'table-seven-two', suit: 'clubs', rank: 7, value: 7 }
        ],
        currentPlayer: 0,
        lastCapturer: null,
        status: 'playing'
      });
    });
    cy.get('#play-button').click();
    cy.get('#scopa-hand button[aria-label="7 di denari"]').click();
    cy.get('#scopa-capture-dialog [role="dialog"]').should('be.visible');
    cy.get('#scopa-capture-options button').should('have.length', 2);
    cy.get('#scopa-capture-options button').last().focus().trigger('keydown', { key: 'Tab' });
    cy.focused().should('have.id', 'scopa-capture-cancel');
    cy.focused().trigger('keydown', { key: 'Tab', shiftKey: true });
    cy.focused().should('have.class', 'scopa-capture-option');
    cy.get('#scopa-capture-cancel').click();
    cy.get('#scopa-capture-dialog').should('not.be.visible');
    cy.focused().should('have.attr', 'aria-label', '7 di denari');
  });

  it('steals matching Ruba Mazzetto piles and reports the final pile winner', () => {
    cy.visit('/');
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 201,
      body: { user: { id: '1', username: 'Tester', email: null }, token: 'e2e-test-token' }
    });
    cy.get('#advance-button').click();
    cy.get('#register-tab').click();
    cy.get('#register-username').type('Tester');
    cy.get('#register-password').type('password123');
    cy.get('#register-form button[type="submit"]').click();
    cy.get('#game-mode').select('ruba-mazzetto');
    cy.window().then((window) => {
      window.RubaMazzettoEngine.createGame = () => ({
        deck: [],
        players: [
          {
            name: 'Tester',
            hand: [{ id: 'matching-four', suit: 'coins', rank: 4, value: 4 }],
            pile: [{ id: 'tester-three', suit: 'cups', rank: 3, value: 3 }]
          },
          {
            name: 'Avversario',
            hand: [{ id: 'opponent-two', suit: 'cups', rank: 2, value: 2 }],
            pile: [{ id: 'target-four', suit: 'clubs', rank: 4, value: 4 }]
          }
        ],
        currentPlayer: 0,
        status: 'playing'
      });
    });
    cy.get('#play-button').click();
    cy.get('#ruba-board').should('be.visible');
    cy.get('#ruba-hand button[aria-label="4 di denari"]').click();
    cy.get('#ruba-message').should('contain.text', 'ha rubato il mazzetto');
    cy.get('#ruba-opponent-count').should('have.text', '0 CARTE');
    cy.get('#turn-label').should('contain.text', 'AVVERSARIO');
    cy.get('#ruba-hand button[aria-label="2 di coppe"]').click();
    cy.get('#ruba-message').should('contain.text', 'Tester vince con 3 carte');
    cy.get('#turn-label').should('have.text', 'PARTITA TERMINATA');
  });

  it('opens a 40-point Scala meld, discards, and hides the next hand until handoff', () => {
    cy.visit('/');
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 201,
      body: { user: { id: '1', username: 'Tester', email: null }, token: 'e2e-test-token' }
    });
    cy.get('#advance-button').click();
    cy.get('#register-tab').click();
    cy.get('#register-username').type('Tester');
    cy.get('#register-password').type('password123');
    cy.get('#register-form button[type="submit"]').click();
    cy.get('#game-mode').select('scala40');
    cy.window().then((window) => {
      window.Scala40Engine.createGame = () => ({
        deck: [{ id: 'drawn-card', rank: 8, suit: 'diamonds', joker: false }],
        discardPile: [{ id: 'discard-top', rank: 7, suit: 'hearts', joker: false }],
        players: [
          {
            name: 'Tester',
            hand: [
              { id: 'run-10', rank: 10, suit: 'clubs', joker: false },
              { id: 'run-11', rank: 11, suit: 'clubs', joker: false },
              { id: 'run-12', rank: 12, suit: 'clubs', joker: false },
              { id: 'run-13', rank: 13, suit: 'clubs', joker: false },
              { id: 'discard-me', rank: 2, suit: 'diamonds', joker: false }
            ],
            opened: false,
            table: []
          },
          {
            name: 'Avversario',
            hand: [{ id: 'opponent-card', rank: 4, suit: 'hearts', joker: false }],
            opened: false,
            table: []
          }
        ],
        currentPlayer: 0,
        status: 'playing',
        drawn: false
      });
    });
    cy.get('#play-button').click();
    cy.get('#scala-board').should('be.visible');
    cy.get('#scala-draw-deck').click();
    ['10 di fiori', 'Jack di fiori', 'Regina di fiori', 'Re di fiori'].forEach((label) => {
      cy.get(`#scala-hand button[aria-label="${label}"]`).click();
    });
    cy.get('#scala-meld').click();
    cy.get('#scala-message').should('contain.text', 'Apertura da almeno 40 punti');
    cy.get('#scala-table').should('contain.text', 'SCALA');
    cy.get('#scala-hand button[aria-label="2 di quadri"]').click();
    cy.get('#scala-discard').click();
    cy.get('#scala-handoff').should('be.visible');
    cy.get('#scala-handoff-continue').should('be.focused');
    cy.get('#scala-hand button').should('not.exist');
    cy.get('#scala-handoff-continue').click();
    cy.get('#scala-handoff').should('not.be.visible');
    cy.get('#scala-turn-name').should('have.text', 'Avversario');
    cy.get('#scala-hand button[aria-label="4 di cuori"]').should('exist');
  });

  it('plays Texas Hold’em and preserves private cards at handoff, fold, and showdown', () => {
    cy.visit('/');
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 201,
      body: { user: { id: '1', username: 'Tester', email: null }, token: 'e2e-test-token' }
    });
    cy.get('#advance-button').click();
    cy.get('#register-tab').click();
    cy.get('#register-username').type('Tester');
    cy.get('#register-password').type('password123');
    cy.get('#register-form button[type="submit"]').click();
    cy.get('#game-mode').select('poker');
    cy.window().then((window) => {
      window.PokerEngine.createGame = () => ({
        deck: [
          { id: 'flop-a', rank: 2, suit: 'clubs' },
          { id: 'flop-b', rank: 5, suit: 'diamonds' },
          { id: 'flop-c', rank: 8, suit: 'spades' },
          { id: 'turn', rank: 9, suit: 'hearts' },
          { id: 'river', rank: 10, suit: 'clubs' }
        ],
        players: [
          {
            name: 'Tester',
            hand: [{ id: 'tester-card-one', rank: 3, suit: 'clubs' }, { id: 'tester-card-two', rank: 4, suit: 'diamonds' }],
            stack: 1000,
            bet: 0,
            contribution: 0,
            folded: false,
            allIn: false
          },
          {
            name: 'Avversario',
            hand: [{ id: 'opponent-card-one', rank: 1, suit: 'spades' }, { id: 'opponent-card-two', rank: 1, suit: 'hearts' }],
            stack: 1000,
            bet: 0,
            contribution: 0,
            folded: false,
            allIn: false
          }
        ],
        community: [],
        pot: 0,
        currentBet: 0,
        minimumRaise: 20,
        currentPlayer: 0,
        street: 'preflop',
        acted: new Set(),
        status: 'playing',
        winners: []
      });
    });
    cy.get('#play-button').click();
    cy.get('#poker-board').should('be.visible');
    cy.get('#poker-player-hand .playing-card').should('have.length', 2);
    cy.get('#poker-opponent-hand .playing-card.card-back').should('have.length', 2);
    cy.get('#poker-raise-amount').should('have.value', '20');
    cy.get('#poker-raise').click();
    cy.get('#poker-handoff').should('be.visible');
    cy.get('#poker-handoff-continue').should('be.focused');
    cy.get('#poker-player-hand .playing-card').should('not.exist');
    cy.get('#poker-handoff-continue').click();
    cy.get('#poker-player-name').should('contain.text', 'AVVERSARIO');
    cy.get('#poker-player-hand .playing-card').should('have.length', 2);
    cy.get('#poker-check-call').should('contain.text', 'CALL 20').click();
    cy.get('#poker-street').should('have.text', 'FLOP');
    cy.get('#poker-community .playing-card').should('have.length', 3);
    cy.get('#poker-fold').click();
    cy.get('#poker-message').should('contain.text', 'Tester (+40)');
    cy.get('#poker-opponent-hand .playing-card.card-back').should('have.length', 2);
    cy.get('#turn-label').should('have.text', 'MANO TERMINATA');

    cy.get('#new-game-button').click();
    cy.get('#poker-check-call').click();
    cy.get('#poker-handoff-continue').click();
    cy.get('#poker-check-call').click();
    cy.get('#poker-street').should('have.text', 'FLOP');
    cy.get('#poker-check-call').click();
    cy.get('#poker-handoff-continue').click();
    cy.get('#poker-check-call').click();
    cy.get('#poker-street').should('have.text', 'TURN');
    cy.get('#poker-check-call').click();
    cy.get('#poker-handoff-continue').click();
    cy.get('#poker-check-call').click();
    cy.get('#poker-street').should('have.text', 'RIVER');
    cy.get('#poker-check-call').click();
    cy.get('#poker-handoff-continue').click();
    cy.get('#poker-check-call').click();
    cy.get('#poker-message').should('contain.text', 'Mano terminata');
    cy.get('#poker-community .playing-card').should('have.length', 5);
    cy.get('#poker-opponent-hand .playing-card.card-back').should('not.exist');
  });

  it('plays Millemiglia turns with draw, a valid start, a hazard, and private-hand handoffs', () => {
    cy.visit('/');
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 201,
      body: { user: { id: '1', username: 'Tester', email: null }, token: 'e2e-test-token' }
    });
    cy.intercept('GET', '/api/auth/me', {
      statusCode: 200,
      body: { user: { id: '1', username: 'Tester', stats: [] } }
    });
    cy.get('#advance-button').click();
    cy.get('#register-tab').click();
    cy.get('#register-username').type('Tester');
    cy.get('#register-password').type('password123');
    cy.get('#register-form button[type="submit"]').click();
    cy.get('#lobby-screen').should('be.visible');
    cy.get('#game-mode').select('mille');
    cy.window().then((window) => {
      window.MilleEngine.createGame = () => ({
        deck: [
          { id: 'tester-draw', type: 'distance', distance: 25 },
          { id: 'opponent-draw', type: 'distance', distance: 50 }
        ],
        players: [
          {
            name: 'Tester',
            hand: [{ id: 'tester-roll', type: 'roll' }, { id: 'tester-distance', type: 'distance', distance: 25 }],
            distance: 0, moving: false, stopped: true, speedLimited: false, usedTwoHundred: 0, safeties: []
          },
          {
            name: 'Avversario',
            hand: [{ id: 'opponent-stop', type: 'stop' }, { id: 'opponent-distance', type: 'distance', distance: 50 }],
            distance: 0, moving: false, stopped: true, speedLimited: false, usedTwoHundred: 0, safeties: []
          }
        ],
        currentPlayer: 0,
        status: 'playing',
        winner: null,
        drawn: false
      });
    });
    cy.get('#play-button').click();
    cy.get('#mille-board').should('be.visible');
    cy.get('#mille-player-distance').should('have.text', '0');
    cy.get('#mille-draw').click();
    cy.get('#mille-hand button[aria-label="Via libera"]').click();
    cy.get('#mille-play').click();
    cy.get('#mille-handoff').should('be.visible');
    cy.get('#mille-handoff-continue').should('be.focused');
    cy.get('#mille-hand button').should('not.exist');
    cy.get('#mille-handoff-continue').click();
    cy.get('#mille-turn-name').should('have.text', 'AVVERSARIO');
    cy.get('#mille-draw').click();
    cy.get('#mille-hand button[aria-label="Stop"]').click();
    cy.get('#mille-play').click();
    cy.get('#mille-handoff').should('be.visible');
    cy.get('#mille-handoff-continue').click();
    cy.get('#mille-turn-name').should('have.text', 'TESTER');
    cy.get('#mille-player-status').should('contain.text', 'Fermo');
    cy.get('#mille-message').should('contain.text', 'Pesca una carta');
    cy.get('#back-button').click();
    cy.get('#game-mode').select('poker');
    cy.get('#play-button').click();
    cy.get('#poker-board').should('be.visible');
    cy.get('#mille-board').should('not.be.visible');
    cy.get('#back-button').click();
    cy.get('#game-mode').select('mille');
    cy.get('#play-button').click();
    cy.get('#mille-board').should('be.visible');
    cy.get('#poker-board').should('not.be.visible');
  });

  it('creates an online room and receives a server-authoritative game with private hands', () => {
    cy.visit('/');
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 201,
      body: { user: { id: '1', username: 'Tester', email: null }, token: 'e2e-test-token' }
    });
    cy.get('#advance-button').click();
    cy.get('#register-tab').click();
    cy.get('#register-username').type('Tester');
    cy.get('#register-password').type('password123');
    cy.get('#register-form button[type="submit"]').click();
    cy.window().then((window) => {
      class FakeWSClient {
        constructor() { this.listeners = new Map(); this.started = []; this.authenticated = false; window.__wsClient = this; }
        on(type, listener) { this.listeners.set(type, listener); }
        emit(type, payload) { this.listeners.get(type)?.(payload); }
        async connect() { this.authenticated = true; return { userId: 'host-id', username: 'Tester' }; }
        createRoom() {
          this.emit('room.created', {
            id: 'A1B2C3D4',
            hostId: 'host-id',
            players: [{ userId: 'host-id', username: 'Tester' }]
          });
        }
        startGame(mode) {
          this.started.push(mode);
          const state = window.UnoEngine.createGame(['Tester', 'Ospite']);
          state.onlineUserIds = ['host-id', 'guest-id'];
          const privateHand = state.players[0].hand;
          state.players = state.players.map((player) => ({
            ...player,
            handCount: player.hand.length,
            hand: [],
            isHuman: true
          }));
          state.drawPile = Array(state.drawPile.length).fill(null);
          const message = { version: 1, state, privateHand };
          this.lastState = JSON.parse(JSON.stringify(message));
          this.emit('game.state', message);
        }
        leaveRoom() {}
        close() { this.authenticated = false; }
      }
      window.UnoWSClient.WSClient = FakeWSClient;
    });
    cy.get('#create-room-button').click();
    cy.get('#game-mode').should('be.disabled');
    cy.get('#start-online-button').should('be.visible').and('be.disabled');
    cy.window().then((window) => {
      window.__wsClient.emit('room.playerJoined', { userId: 'guest-id', username: 'Ospite' });
    });
    cy.get('#start-online-button').should('be.enabled').click();
    cy.get('#game-screen').should('be.visible');
    cy.get('#opponents .opponent').should('have.length', 1);
    cy.get('#play-button').should('be.disabled');
    cy.get('#game-mode').should('be.disabled');
    cy.window().its('__wsClient.started').should('deep.equal', ['uno']);
    cy.window().its('__wsClient.lastState').should((snapshot) => {
      expect(snapshot.state.players.map((player) => player.hand)).to.deep.equal([[], []]);
      expect(snapshot.privateHand).to.have.length(snapshot.state.players[0].handCount);
      expect(snapshot.state.drawPile.every((card) => card === null)).to.equal(true);
    });
    cy.window().its('__wsClient.lastState').then((snapshot) => {
      cy.get('#hand button').should('have.length', snapshot.privateHand.length);
    });
  });

  it('shows only the authenticated player hand online and sends their card action to the server', () => {
    cy.visit('/');
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 201,
      body: { user: { id: '2', username: 'Ospite', email: null }, token: 'e2e-guest-token' }
    });
    cy.get('#advance-button').click();
    cy.get('#register-tab').click();
    cy.get('#register-username').type('Ospite');
    cy.get('#register-password').type('password123');
    cy.get('#register-form button[type="submit"]').click();
    cy.window().then((window) => {
      class FakeWSClient {
        constructor() { this.listeners = new Map(); this.actions = []; this.authenticated = false; window.__wsClient = this; }
        on(type, listener) { this.listeners.set(type, listener); }
        emit(type, payload) { this.listeners.get(type)?.(payload); }
        async connect() { this.authenticated = true; return { userId: 'guest-id', username: 'Ospite' }; }
        joinRoom() {
          this.emit('room.joined', {
            id: 'A1B2C3D4',
            hostId: 'host-id',
            players: [{ userId: 'host-id', username: 'Tester' }, { userId: 'guest-id', username: 'Ospite' }]
          });
        }
        sendGameAction(action) { this.actions.push(action); }
        leaveRoom() {}
        close() { this.authenticated = false; }
      }
      window.UnoWSClient.WSClient = FakeWSClient;
    });
    cy.get('#room-code').type('A1B2C3D4');
    cy.get('#join-room-button').click();
    cy.window().then((window) => {
      window.__wsClient.emit('game.state', {
        version: 1,
        state: {
          players: [
            { name: 'Tester', hand: [], handCount: 2 },
            { name: 'Ospite', hand: [], handCount: 1 }
          ],
          onlineUserIds: ['host-id', 'guest-id'],
          drawPile: Array(30).fill(null),
          discardPile: [{ id: 'top', color: 'red', value: '5' }],
          currentPlayer: 1,
          direction: 1,
          pendingDraw: 0,
          chosenColor: null,
          stacking: true,
          justDrawnCardId: null,
          status: 'playing',
          winner: null
        },
        privateHand: [{ id: 'guest-card', color: 'red', value: '2' }]
      });
    });
    cy.get('#game-screen').should('be.visible');
    cy.get('#hand-count').should('have.text', '1');
    cy.get('#opponents .opponent small').should('have.text', '2 CARTE');
    cy.get('#hand button[aria-label="ROSSO, 2"]').click();
    cy.window().its('__wsClient.actions').should((actions) => {
      expect(actions).to.have.length(1);
      expect(actions[0]).to.include({ type: 'play', cardId: 'guest-card' });
    });
  });

  it('buys a theme with V-Coins, equips it and persists the active theme', () => {
    const catalog = [
      { id: 'theme-lava', name: 'Lava Rossa', description: 'Un tema ardente per l’arena.', category: 'theme', theme: 'lava-red', price: 350, owned: false, equipped: false },
      { id: 'theme-matrix', name: 'Matrix', description: 'Accenti verdi per una partita nel codice.', category: 'theme', theme: 'matrix-green', price: 350, owned: false, equipped: false },
      { id: 'theme-royal', name: 'Viola Reale', description: 'Un look regale con bagliori viola.', category: 'theme', theme: 'royal-purple', price: 500, owned: false, equipped: false }
    ];
    let balance = 1000;
    let activeTheme = 'cyber-blue';
    let ownedIds = new Set();
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 201,
      body: { user: { id: '1', username: 'Tester', email: null }, token: 'e2e-test-token' }
    });
    cy.intercept('GET', '/api/store', (request) => {
      request.reply({
        credits: balance,
        activeTheme,
        transactions: ownedIds.has('theme-lava')
          ? [
            { amount: -350, reason: 'purchase', item_id: 'theme-lava', created_at: '2026-10-01T12:00:00.000Z' },
            { amount: 1000, reason: 'starter', item_id: null, created_at: '2026-09-30T12:00:00.000Z' }
          ]
          : [{ amount: 1000, reason: 'starter', item_id: null, created_at: '2026-09-30T12:00:00.000Z' }],
        items: catalog.map((item) => ({
          ...item,
          owned: ownedIds.has(item.id),
          equipped: activeTheme === item.theme
        }))
      });
    });
    cy.intercept('POST', '/api/store/purchase', (request) => {
      expect(request.body).to.deep.equal({ itemId: 'theme-lava' });
      balance -= 350;
      ownedIds.add('theme-lava');
      request.reply({ statusCode: 201, body: { itemId: 'theme-lava', credits: balance } });
    });
    cy.intercept('POST', '/api/store/equip', (request) => {
      const themes = { 'theme-lava': 'lava-red', 'theme-matrix': 'matrix-green', 'theme-royal': 'royal-purple', 'theme-cyber': 'cyber-blue' };
      activeTheme = themes[request.body.itemId];
      request.reply({ statusCode: 200, body: { itemId: request.body.itemId, theme: activeTheme } });
    });
    cy.visit('/');
    cy.get('#advance-button').click();
    cy.get('#register-tab').click();
    cy.get('#register-username').type('Tester');
    cy.get('#register-password').type('password123');
    cy.get('#register-form button[type="submit"]').click();
    cy.get('.top-tab[data-section="shop"]').click();
    cy.get('#store-credits').should('have.text', '1000');
    cy.get('#store-items [data-store-action="purchase"][data-item-id="theme-lava"]').click();
    cy.get('#store-credits').should('have.text', '650');
    cy.get('#store-items [data-store-action="equip"][data-item-id="theme-lava"]').click();
    cy.get('html').should('have.attr', 'data-theme', 'lava-red');
    cy.get('#store-items [data-item-id="theme-lava"]').should('be.disabled').and('have.text', 'EQUIPAGGIATO');
    cy.get('.top-tab[data-section="wallet"]').click();
    cy.get('#wallet-credits').should('have.text', '650');
    cy.get('#wallet-active-theme').should('contain.text', 'Lava Rossa');
    cy.get('#wallet-history .wallet-transaction').should('have.length', 2);
    cy.get('#wallet-history .wallet-transaction').first().should('contain.text', 'Acquisto · Lava Rossa').and('contain.text', '-350 V');
    cy.get('.top-tab[data-section="locker"]').click();
    cy.get('#locker-items [data-locker-item-id]').should('have.length', 2);
    cy.get('#locker-items [data-locker-item-id="theme-lava"]').should('be.disabled').and('have.text', 'EQUIPAGGIATO');
    cy.get('#locker-items [data-locker-item-id="theme-cyber"]').click();
    cy.get('html').should('have.attr', 'data-theme', 'cyber-blue');
    cy.get('#locker-items [data-locker-item-id="theme-lava"]').click();
    cy.get('html').should('have.attr', 'data-theme', 'lava-red');
    cy.get('.top-tab[data-section="shop"]').click();
    cy.get('#theme-button').click();
    cy.get('html').should('have.attr', 'data-theme', 'cyber-blue');
  });

  it('unlocks Battle Card rewards and presents claim-all rewards one by one', () => {
    let premiumUnlocked = false;
    let rewardsClaimed = false;
    const getPass = () => ({
      season: { id: 'ultra-season-1', name: 'Stagione UNO ULTRA' },
      level: premiumUnlocked ? 22 : 2,
      maxLevel: 100,
      experience: 1200,
      experiencePerLevel: 1000,
      premiumUnlocked,
      prices: { standard: 1000, boosted: 1500 },
      credits: rewardsClaimed ? 1010 : premiumUnlocked ? 500 : 2000,
      rewards: Array.from({ length: 100 }, (_item, index) => {
        const level = index + 1;
        return [
          { level, track: 'free', credits: 5, claimed: rewardsClaimed && level <= (premiumUnlocked ? 22 : 2) },
          { level, track: 'premium', credits: 5, claimed: rewardsClaimed && level <= (premiumUnlocked ? 22 : 2) }
        ];
      }).flat()
    });
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 201,
      body: { user: { id: '1', username: 'Tester', email: null }, token: 'e2e-test-token' }
    });
    cy.intercept('GET', '/api/battle-card', (request) => request.reply(getPass()));
    cy.intercept('POST', '/api/battle-card/unlock', (request) => {
      expect(request.body).to.deep.equal({ tier: 'boosted' });
      premiumUnlocked = true;
      request.reply({
        statusCode: 200,
        body: { tier: 'boosted', premiumUnlocked: true, bonusLevels: 20, credits: 500 }
      });
    });
    cy.intercept('POST', '/api/battle-card/claim-all', (request) => {
      expect(request.body).to.deep.equal({});
      rewardsClaimed = true;
      request.reply({
        statusCode: 200,
        body: {
          rewards: [
            { level: 1, track: 'free', credits: 5 },
            { level: 1, track: 'premium', credits: 5 }
          ],
          credits: 510,
          level: 22
        }
      });
    });
    cy.visit('/');
    cy.get('#advance-button').click();
    cy.get('#register-tab').click();
    cy.get('#register-username').type('Tester');
    cy.get('#register-password').type('password123');
    cy.get('#register-form button[type="submit"]').click();
    cy.get('.top-tab[data-section="pass"]').click();
    cy.get('#battle-card-panel').should('be.visible');
    cy.get('#battle-card-level-label').should('contain.text', '2 / 100');
    cy.get('#battle-card-levels [role="listitem"]').should('have.length', 100);
    cy.get('#battle-card-unlock-boosted').click();
    cy.get('#battle-card-level-label').should('contain.text', '22 / 100');
    cy.get('#battle-card-claim-all').click();
    cy.get('#battle-card-reward-dialog').should('be.visible');
    cy.get('#battle-card-reward-copy').should('contain.text', 'Livello 1 · Ricompensa gratuita');
    cy.get('#battle-card-reward-next').click();
    cy.get('#battle-card-reward-copy').should('contain.text', 'Livello 1 · Ricompensa premium');
    cy.get('#battle-card-reward-next').should('have.text', 'CHIUDI').click();
    cy.get('#battle-card-reward-dialog').should('not.be.visible');
    cy.focused().should('have.id', 'battle-card-title');
  });

  it('refreshes persisted rank and MMR when returning to the lobby', () => {
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 201,
      body: { user: { id: '1', username: 'Tester', email: null }, token: 'e2e-test-token' }
    });
    cy.intercept('GET', '/api/auth/me', {
      statusCode: 200,
      body: {
        user: {
          id: '1',
          username: 'Tester',
          stats: [{ mode: 'uno', mmr: 315, rank: 'Bronze II' }]
        }
      }
    });
    cy.visit('/');
    cy.get('#advance-button').click();
    cy.get('#register-tab').click();
    cy.get('#register-username').type('Tester');
    cy.get('#register-password').type('password123');
    cy.get('#register-form button[type="submit"]').click();
    cy.get('#play-button').click();
    cy.get('#game-screen').should('be.visible');
    cy.get('#back-button').click();
    cy.get('#rank-value').should('have.text', 'BRONZE II');
    cy.get('#rank-mmr').should('have.text', '315 MMR');
  });

  it('tracks daily online challenges and claims their virtual coin reward', () => {
    let claimed = false;
    const challenges = () => [{
      challenge_id: 'uno-first-match',
      title: 'Prima partita',
      description: 'Completa una partita UNO online.',
      target: 1,
      reward: 50,
      progress: 1,
      claimed,
      challenge_date: '2026-10-09'
    }];
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 201,
      body: { user: { id: '1', username: 'Tester', email: null }, token: 'e2e-test-token' }
    });
    cy.intercept('GET', '/api/challenges', (request) => {
      request.reply({ challenges: challenges() });
    });
    cy.intercept('POST', '/api/challenges/claim', (request) => {
      expect(request.body).to.deep.equal({ challengeId: 'uno-first-match' });
      claimed = true;
      request.reply({ statusCode: 200, body: { challengeId: 'uno-first-match', reward: 50, credits: 1050 } });
    });
    cy.visit('/');
    cy.get('#advance-button').click();
    cy.get('#register-tab').click();
    cy.get('#register-username').type('Tester');
    cy.get('#register-password').type('password123');
    cy.get('#register-form button[type="submit"]').click();
    cy.get('.top-tab[data-section="challenges"]').click();
    cy.get('#challenges-panel').should('be.visible');
    cy.get('#challenges-date').should('contain.text', '2026-10-09');
    cy.get('#challenge-list [role="listitem"]').should('have.length', 1);
    cy.get('#challenge-list button').should('have.text', 'RISCATTA').click();
    cy.get('#challenges-message').should('contain.text', '50 V-Coins');
    cy.get('#challenge-list button').should('have.text', 'RISCATTATA').and('be.disabled');
  });
});
