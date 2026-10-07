'use strict';

const blackjack = require('../../frontend/js/game-modes/blackjack');
const scopa = require('../../frontend/js/game-modes/scopa');
const rubaMazzetto = require('../../frontend/js/game-modes/ruba-mazzetto');
const scala40 = require('../../frontend/js/game-modes/scala40');
const burraco = require('../../frontend/js/game-modes/burraco');

describe('Italian and casino card engines', () => {
  test('BlackJack values aces flexibly and ends on bust', () => {
    expect(blackjack.scoreHand([{ rank: 1 }, { rank: 9 }])).toBe(20);
    expect(blackjack.scoreHand([{ rank: 1 }, { rank: 9 }, { rank: 5 }])).toBe(15);
    const state = blackjack.createGame(() => 0.3);
    state.player = [{ rank: 10 }, { rank: 8 }];
    state.deck = [{ rank: 7, suit: 'clubs' }];
    blackjack.hit(state);
    expect(state.status).toBe('finished');
    expect(state.winner).toBe('dealer');
    expect(() => blackjack.hit(state)).toThrow('già terminata');
  });

  test('BlackJack dealer stands on 17 and supports doubling down', () => {
    const state = blackjack.createGame(() => 0.3);
    state.player = [{ rank: 10 }, { rank: 6 }];
    state.dealer = [{ rank: 10 }, { rank: 7 }];
    state.deck = [{ rank: 3, suit: 'clubs' }];
    blackjack.doubleDown(state);
    expect(state.doubled).toBe(true);
    expect(state.winner).toBe('player');
    expect(() => blackjack.doubleDown(state)).toThrow('già terminata');
  });

  test('Scopa requires captures when available and records a sweep', () => {
    const state = scopa.createGame(['Ada', 'Bot'], () => 0.3);
    const played = { id: 'played', suit: 'coins', rank: 7, value: 7 };
    const tableCard = { id: 'table-seven', suit: 'cups', rank: 7, value: 7 };
    state.players[0].hand = [played];
    state.table = [tableCard];
    expect(() => scopa.playCard(state, 0, played.id)).toThrow('presa valida');
    expect(state.players[0].hand).toHaveLength(1);
    const result = scopa.playCard(state, 0, played.id, [tableCard.id]);
    expect(result.scopa).toBe(true);
    expect(state.players[0].captured).toHaveLength(2);
    expect(scopa.roundPoints(state)[0].sevenOfCoins).toBe(true);
  });

  test('Scopa captures cards adding to the played value when no exact card exists', () => {
    const state = scopa.createGame(['Ada', 'Bot'], () => 0.3);
    state.players[0].hand = [{ id: 'played', suit: 'cups', rank: 5, value: 5 }];
    state.table = [
      { id: 'two', suit: 'coins', rank: 2, value: 2 },
      { id: 'three', suit: 'clubs', rank: 3, value: 3 }
    ];
    expect(scopa.legalCaptures(state.table, state.players[0].hand[0])).toHaveLength(1);
    scopa.playCard(state, 0, 'played', ['two', 'three']);
    expect(state.players[0].captured).toHaveLength(3);
  });

  test('Scopa scores primiera using the best card of each suit', () => {
    const state = scopa.createGame(['Ada', 'Bot'], () => 0.3);
    state.players[0].captured = [
      { suit: 'coins', rank: 7 }, { suit: 'cups', rank: 7 },
      { suit: 'swords', rank: 7 }, { suit: 'clubs', rank: 7 }
    ];
    state.players[0].scopes = 1;
    state.players[1].captured = [
      { suit: 'coins', rank: 6 }, { suit: 'coins', rank: 5 }, { suit: 'cups', rank: 1 }
    ];
    const scores = scopa.roundPoints(state);
    expect(scores[0].primiera).toBe(84);
    expect(scores[1].primiera).toBe(0);
    expect(scores[0].points).toBe(4);
    expect(scores[1].points).toBe(1);
  });

  test('Ruba Mazzetto steals an opponent pile with a matching top card', () => {
    const state = rubaMazzetto.createGame(['Ada', 'Bot'], () => 0.3);
    const stolen = { id: 'stolen', suit: 'coins', rank: 4, value: 4 };
    state.players[0].hand = [{ id: 'matching', suit: 'cups', rank: 4, value: 4 }];
    state.players[1].pile = [stolen];
    const result = rubaMazzetto.playCard(state, 0, 'matching', 1);
    expect(result.stolen).toBe(true);
    expect(state.players[0].pile).toEqual([stolen, { id: 'matching', suit: 'cups', rank: 4, value: 4 }]);
    expect(state.players[1].pile).toHaveLength(0);
  });

  test('Ruba Mazzetto rejects invalid turns and drops unmatched cards on the pile', () => {
    expect(() => rubaMazzetto.createGame(['Ada'])).toThrow('da 2 a 4 giocatori');
    const state = rubaMazzetto.createGame(['Ada', 'Bot', 'Bot 2'], () => 0.3);
    expect(() => rubaMazzetto.playCard(state, 1, 'missing')).toThrow('Non è il turno');
    state.players[0].hand = [{ id: 'fresh', suit: 'cups', rank: 3, value: 3 }];
    state.players[1].pile = [{ id: 'other-rank', suit: 'coins', rank: 9, value: 9 }];
    state.players[1].hand = [];
    state.players[2].hand = [];
    const result = rubaMazzetto.playCard(state, 0, 'fresh');
    expect(result.stolen).toBe(false);
    expect(state.players[0].pile).toEqual([{ id: 'fresh', suit: 'cups', rank: 3, value: 3 }]);
    expect(state.status).toBe('finished');
  });

  test('Scala 40 validates a 40-point opening meld and finishes on discard', () => {
    const state = scala40.createGame(['Ada', 'Bot'], () => 0.3);
    const cards = [10, 11, 12, 13].map((rank) => ({ id: `c${rank}`, rank, suit: 'clubs', joker: false }));
    scala40.drawCard(state, 0);
    state.players[0].hand = [...cards, { id: 'last', rank: 8, suit: 'spades', joker: false }];
    expect(() => scala40.openMeld(state, 0, cards.slice(0, 3).map((card) => card.id))).toThrow('40 punti');
    scala40.openMeld(state, 0, cards.map((card) => card.id));
    scala40.discard(state, 0, 'last');
    expect(state.status).toBe('finished');
    expect(state.winner).toBe(0);
  });

  test('Scala 40 requires at least one card to discard after laying a meld', () => {
    const state = scala40.createGame(['Ada', 'Bot'], () => 0.3);
    const cards = [10, 11, 12, 13].map((rank) => ({ id: `c${rank}`, rank, suit: 'clubs', joker: false }));
    scala40.drawCard(state, 0);
    state.players[0].hand = cards;
    expect(() => scala40.openMeld(state, 0, cards.map((card) => card.id))).toThrow('almeno una carta da scartare');
    expect(state.players[0].hand).toEqual(cards);
    expect(state.players[0].opened).toBe(false);
  });

  describe('Millemiglia and Texas Hold’em engines', () => {
    const poker = require('../../frontend/js/game-modes/poker');
    const mille = require('../../frontend/js/game-modes/mille');

    test('evaluates poker hands with ace-low straights and kickers', () => {
      const wheel = [
        { rank: 1, suit: 'clubs' }, { rank: 2, suit: 'hearts' }, { rank: 3, suit: 'spades' },
        { rank: 4, suit: 'diamonds' }, { rank: 5, suit: 'clubs' }
      ];
      const pair = [
        { rank: 13, suit: 'clubs' }, { rank: 13, suit: 'hearts' }, { rank: 1, suit: 'spades' },
        { rank: 8, suit: 'diamonds' }, { rank: 4, suit: 'clubs' }
      ];
      expect(poker.evaluateFive(wheel)).toEqual([4, 5]);
      expect(poker.compareHands(wheel, pair)).toBe(1);
      expect(poker.evaluateBest([...wheel, { rank: 10, suit: 'clubs' }, { rank: 11, suit: 'clubs' }])).toHaveLength(5);
    });

    test('plays a complete check-call-free Hold’em hand through showdown', () => {
      const state = poker.createGame(['Ada', 'Bot'], { random: () => 0.3 });
      poker.act(state, 0, 'raise', 50);
      poker.act(state, 1, 'call');
      expect(state.street).toBe('flop');
      for (const street of ['turn', 'river']) {
        poker.act(state, state.currentPlayer, 'check');
        poker.act(state, state.currentPlayer, 'check');
        expect(state.street).toBe(street);
      }
      poker.act(state, state.currentPlayer, 'check');
      poker.act(state, state.currentPlayer, 'check');
      expect(state.status).toBe('finished');
      expect(state.pot).toBe(0);
      expect(state.winners.length).toBeGreaterThan(0);
      expect(state.players.reduce((sum, player) => sum + player.stack, 0)).toBe(2000);
    });

    test('rejects poker checks facing a bet and awards the pot after a fold', () => {
      const state = poker.createGame(['Ada', 'Bot'], { random: () => 0.2 });
      poker.act(state, 0, 'raise', 40);
      expect(() => poker.act(state, 1, 'check')).toThrow('devi vedere la puntata');
      poker.act(state, 1, 'fold');
      expect(state.status).toBe('finished');
      expect(state.players[0].stack).toBe(1000);
    });

    test('builds a 106-card Mille deck, starts with three cards and enforces draw-and-play turns', () => {
      expect(mille.createDeck(() => 0.5)).toHaveLength(106);
      const state = mille.createGame(['Ada', 'Bot'], () => 0.5);
      expect(state.players.map((player) => player.hand.length)).toEqual([3, 3]);
      expect(() => mille.playCard(state, 0, state.players[0].hand[0].id)).toThrow('Pesca prima');
      mille.draw(state, 0);
      mille.discardCard(state, 0, state.players[0].hand[0].id);
      expect(state.currentPlayer).toBe(1);
      expect(state.players[0].hand).toHaveLength(3);
    });

    test('plays a remedy after an opponent stops the Mille race', () => {
      const state = mille.createGame(['Ada', 'Bot'], () => 0.5);
      state.players[0].hand = [{ id: 'roll', type: 'roll' }];
      mille.draw(state, 0);
      mille.playCard(state, 0, 'roll');
      state.players[1].hand = [{ id: 'stop', type: 'stop' }];
      mille.draw(state, 1);
      mille.playCard(state, 1, 'stop', 0);
      expect(state.players[0].stopped).toBe(true);
      state.players[0].hand = [{ id: 'restart', type: 'roll' }];
      mille.draw(state, 0);
      mille.playCard(state, 0, 'restart');
      expect(state.players[0].moving).toBe(true);
      expect(state.players[0].stopped).toBe(false);
    });

    test('Mille prevents illegal mileage, duplicate draws and unsupported player counts', () => {
      expect(() => mille.createGame(['Ada'])).toThrow('due giocatori');
      const state = mille.createGame(['Ada', 'Bot'], () => 0.4);
      expect(() => mille.draw(state, 1)).toThrow('Non puoi pescare');
      state.players[0].hand = [{ id: 'miles', type: 'distance', distance: 100 }];
      mille.draw(state, 0);
      expect(() => mille.draw(state, 0)).toThrow('Non puoi pescare');
      expect(() => mille.playCard(state, 0, 'miles')).toThrow('carta di marcia');
      state.players[0].hand = [{ id: 'roll', type: 'roll' }];
      mille.playCard(state, 0, 'roll');
      expect(state.players[0].moving).toBe(true);
      expect(() => mille.draw(state, 0)).toThrow('Non puoi pescare');
    });

    test('Mille enforces speed limits, the two 200-mile cards and the 1000-mile cap', () => {
      const state = mille.createGame(['Ada', 'Bot'], () => 0.4);
      state.players[0].moving = true;
      state.players[0].stopped = false;
      state.players[0].speedLimited = true;
      state.players[0].hand = [{ id: 'too-fast', type: 'distance', distance: 75 }];
      mille.draw(state, 0);
      expect(() => mille.playCard(state, 0, 'too-fast')).toThrow('limite di velocità');

      state.players[0].hand = [{ id: 'two-hundred', type: 'distance', distance: 200 }];
      state.players[0].speedLimited = false;
      state.players[0].usedTwoHundred = 2;
      expect(() => mille.playCard(state, 0, 'two-hundred')).toThrow('massimo due');

      state.players[0].hand = [{ id: 'over-cap', type: 'distance', distance: 100 }];
      state.players[0].distance = 950;
      expect(() => mille.playCard(state, 0, 'over-cap')).toThrow('superare i 1000');
      mille.discardCard(state, 0, 'over-cap');
      expect(state.currentPlayer).toBe(1);
    });

    test('Mille blocks hazards against stopped or protected players and rejects duplicate safety', () => {
      const state = mille.createGame(['Ada', 'Bot'], () => 0.4);
      state.players[0].hand = [{ id: 'stop', type: 'stop' }];
      mille.draw(state, 0);
      expect(() => mille.playCard(state, 0, 'stop', 1)).toThrow('avversario in marcia');
      state.players[1].moving = true;
      state.players[1].stopped = false;
      state.players[1].safeties = ['right-of-way'];
      expect(() => mille.playCard(state, 0, 'stop', 1)).toThrow('protetto');

      state.players[0].hand = [{ id: 'safety', type: 'extra-tank' }];
      expect(() => mille.playCard(state, 0, 'safety')).not.toThrow();
      state.currentPlayer = 0;
      state.players[0].hand = [{ id: 'duplicate', type: 'extra-tank' }];
      mille.draw(state, 0);
      expect(() => mille.playCard(state, 0, 'duplicate')).toThrow('già stata giocata');
    });

    test('Mille wins exactly at 1000, limits 200 cards and removes speed limits', () => {
      const state = mille.createGame(['Ada', 'Bot'], () => 0.4);
      state.players[0].moving = true;
      state.players[0].stopped = false;
      state.players[0].distance = 800;
      state.players[0].hand = [{ id: 'two-hundred', type: 'distance', distance: 200 }];
      mille.draw(state, 0);
      mille.playCard(state, 0, 'two-hundred');
      expect(state.status).toBe('finished');
      expect(state.winner).toBe(0);
      expect(state.players[0].usedTwoHundred).toBe(1);

      const second = mille.createGame(['Ada', 'Bot'], () => 0.4);
      second.players[0].moving = true;
      second.players[0].stopped = false;
      second.players[0].speedLimited = true;
      second.players[0].hand = [{ id: 'end-limit', type: 'end-speed-limit' }];
      mille.draw(second, 0);
      mille.playCard(second, 0, 'end-limit');
      expect(second.players[0].speedLimited).toBe(false);
    });
  });

  test('Scala 40 rejects a run with gaps and enforces the active turn', () => {
    const cards = [
      { rank: 2, suit: 'hearts', joker: false },
      { rank: 4, suit: 'hearts', joker: false },
      { rank: 8, suit: 'clubs', joker: false }
    ];
    expect(scala40.getMeldType(cards)).toBeNull();
    const state = scala40.createGame(['Ada', 'Bot'], () => 0.4);
    expect(() => scala40.drawCard(state, 1)).toThrow('Non puoi pescare');
  });

  test('Burraco deals two decks, forms a seven-card burraco, and takes the pozzetto', () => {
    const state = burraco.createGame(['Ada', 'Bot 1', 'Bot 2', 'Bot 3'], () => 0.4);
    expect(state.players.map((player) => player.hand.length)).toEqual([11, 11, 11, 11]);
    expect(state.deck).toHaveLength(42);
    const run = Array.from({ length: 7 }, (_, index) => ({
      id: `run-${index}`,
      rank: index + 2,
      suit: 'clubs',
      joker: false
    }));
    burraco.draw(state, 0);
    state.players[0].hand = run;
    expect(burraco.layMeld(state, 0, run.map((card) => card.id))).toMatchObject({ type: 'run', burraco: true });
    state.players[0].pozzetto = [{ id: 'pozzetto-card', rank: 1, suit: 'spades', joker: false }];
    expect(burraco.takePozzetto(state, 0)).toBe(1);
  });

  test('Burraco enforces draws, handles the discard pile, and rejects invalid turns', () => {
    expect(() => burraco.createGame(['Ada', 'Bot'])).toThrow('quattro giocatori');
    const state = burraco.createGame(['Ada', 'Bot 1', 'Bot 2', 'Bot 3'], () => 0.2);
    expect(() => burraco.draw(state, 1)).toThrow('Non puoi pescare');
    expect(() => burraco.draw(state, 0, true)).toThrow('monte degli scarti');
    expect(() => burraco.discard(state, 0, 'missing')).toThrow('Pesca prima');
    burraco.draw(state, 0);
    expect(() => burraco.draw(state, 0)).toThrow('Non puoi pescare');
    expect(() => burraco.layMeld(state, 0, ['missing', 'missing2', 'missing3'])).toThrow('combinazione non è valida');
    expect(() => burraco.takePozzetto(state, 0)).toThrow('pozzetto');
    expect(() => burraco.discard(state, 0, 'missing')).toThrow('non è nella tua mano');
    burraco.discard(state, 0, state.players[0].hand[0].id);
    expect(state.currentPlayer).toBe(1);
    state.deck = [];
    expect(() => burraco.draw(state, 1)).toThrow('mazzo è esaurito');
  });

  test('Burraco draws the pozzetto after emptying the hand', () => {
    const state = burraco.createGame(['Ada', 'Bot 1', 'Bot 2', 'Bot 3'], () => 0.2);
    state.players[0].hand = [];
    state.players[0].pozzetto = [{ id: 'pozzetto', rank: 5, suit: 'clubs', joker: false }];
    burraco.draw(state, 0);
    expect(state.players[0].hand).toEqual([{ id: 'pozzetto', rank: 5, suit: 'clubs', joker: false }]);
    expect(state.players[0].pozzetto).toHaveLength(0);
    expect(state.drawn).toBe(true);
  });
});
