'use strict';

const {
  COLORS, createDeck, createGame, getPlayableCards, drawCards, passTurn, playCard,
  chooseBotMove, getBotProfile, getBotDifficulty, getBotThinkTime
} = require('../../frontend/js/game-engine');

describe('UNO engine', () => {
  beforeEach(() => jest.resetModules());

  test('creates a 108-card deck with the expected composition', () => {
    const deck = createDeck(() => 0.5);
    expect(deck).toHaveLength(108);
    expect(deck.filter((card) => card.value === '0')).toHaveLength(4);
    expect(deck.filter((card) => card.value === 'wild')).toHaveLength(4);
    expect(deck.filter((card) => card.value === 'wild4')).toHaveLength(4);
    COLORS.forEach((color) => expect(deck.filter((card) => card.color === color)).toHaveLength(25));
  });

  test('deals seven cards and starts on a non-wild discard', () => {
    const game = createGame(['Ada', 'Bot'], { random: () => 0.5 });
    expect(game.players.map((player) => player.hand)).toHaveLength(2);
    expect(game.players.slice(1).every((player) => player.hand.length === 7)).toBe(true);
    expect([7, 9]).toContain(game.players[0].hand.length);
    expect(game.discardPile[0].color).not.toBe('wild');
    expect(game.status).toBe('playing');
    expect(game.players.map((player) => player.mmr)).toEqual([200, 200]);
  });

  test('applies skip, reverse, and draw-two effects from the opening card', () => {
    const skipGame = createGame(['Ada', 'Bot', 'Bot 2'], { random: () => 0.55 });
    expect(skipGame.discardPile[0].value).toBe('skip');
    expect(skipGame.currentPlayer).toBe(1);

    const reverseGame = createGame(['Ada', 'Bot', 'Bot 2'], { random: () => 0 });
    expect(reverseGame.discardPile[0].value).toBe('reverse');
    expect(reverseGame.direction).toBe(-1);
    expect(reverseGame.currentPlayer).toBe(2);

    const drawGame = createGame(['Ada', 'Bot'], { random: () => 0.3 });
    expect(drawGame.discardPile[0].value).toBe('draw2');
    expect(drawGame.players[0].hand).toHaveLength(9);
    expect(drawGame.currentPlayer).toBe(1);
  });

  test('rejects player counts outside the supported range', () => {
    expect(() => createGame(['Solo'])).toThrow('da 2 a 4 giocatori');
    expect(() => createGame(['A', 'B', 'C', 'D', 'E'])).toThrow('da 2 a 4 giocatori');
  });

  test('matches by color or value, and permits wild cards', () => {
    const game = createGame(['Ada', 'Bot']);
    game.discardPile = [{ id: 'top', color: 'red', value: '5' }];
    game.players[0].hand = [
      { id: 'same-color', color: 'red', value: '9' },
      { id: 'same-value', color: 'blue', value: '5' },
      { id: 'wild', color: 'wild', value: 'wild' },
      { id: 'no-match', color: 'green', value: '1' }
    ];
    expect(getPlayableCards(game, 0).map((card) => card.id)).toEqual(['same-color', 'same-value', 'wild']);
  });

  test('requires the pending draw to be stacked or accepted', () => {
    const game = createGame(['Ada', 'Bot']);
    game.discardPile = [{ id: 'top', color: 'red', value: '5' }];
    game.pendingDraw = 2;
    game.players[0].hand = [
      { id: 'plus-two', color: 'blue', value: 'draw2' },
      { id: 'plus-four', color: 'wild', value: 'wild4' }
    ];
    expect(getPlayableCards(game, 0).map((card) => card.id)).toEqual(['plus-two', 'plus-four']);
    game.stacking = false;
    expect(getPlayableCards(game, 0)).toHaveLength(0);
  });

  test('does not allow a wild-four while a matching color is in hand', () => {
    const game = createGame(['Ada', 'Bot']);
    game.discardPile = [{ id: 'top', color: 'red', value: '5' }];
    game.players[0].hand = [
      { id: 'wild-four', color: 'wild', value: 'wild4' },
      { id: 'red-card', color: 'red', value: '1' }
    ];
    expect(getPlayableCards(game, 0).map((card) => card.id)).toEqual(['red-card']);
    game.players[0].hand.pop();
    expect(getPlayableCards(game, 0).map((card) => card.id)).toEqual(['wild-four']);
  });

  test('draws one card and limits the play to that newly drawn card', () => {
    const game = createGame(['Ada', 'Bot']);
    game.currentPlayer = 0;
    game.discardPile = [{ id: 'top', color: 'red', value: '5' }];
    game.players[0].hand = [{ id: 'existing', color: 'red', value: '2' }];
    game.drawPile = [{ id: 'drawn', color: 'red', value: '8' }];
    drawCards(game, 0);
    expect(getPlayableCards(game, 0).map((card) => card.id)).toEqual(['drawn']);
  });

  test('recycles the discard pile when the draw pile runs out', () => {
    const game = createGame(['Ada', 'Bot'], { random: () => 0.5 });
    game.currentPlayer = 0;
    const top = { id: 'top', color: 'red', value: '7' };
    game.drawPile = [];
    game.discardPile = [
      { id: 'old-a', color: 'blue', value: '1' },
      { id: 'old-b', color: 'yellow', value: '2' },
      top
    ];
    drawCards(game, 0);
    expect(game.players[0].hand).toHaveLength(8);
    expect(game.discardPile).toEqual([top]);
  });

  test('can pass after an empty draw pile and returns no playable cards for invalid states', () => {
    const game = createGame(['Ada', 'Bot']);
    game.currentPlayer = 0;
    game.drawPile = [];
    game.discardPile = [{ id: 'top', color: 'red', value: '7' }];
    expect(drawCards(game, 0)).toBe(0);
    expect(getPlayableCards(game, 9)).toEqual([]);
    game.status = 'finished';
    expect(getPlayableCards(game, 0)).toEqual([]);
  });

  test('rejects attempts to play another player’s card or an illegal card', () => {
    const game = createGame(['Ada', 'Bot']);
    game.currentPlayer = 0;
    game.discardPile = [{ id: 'top', color: 'red', value: '5' }];
    game.players[0].hand = [{ id: 'illegal', color: 'green', value: '1' }];
    expect(() => playCard(game, 0, 'illegal')).toThrow('non può essere giocata');
    expect(() => playCard(game, 1, 'missing')).toThrow('Non è il turno');
  });

  test('requires a valid color for wilds and applies it to the next player', () => {
    const game = createGame(['Ada', 'Bot']);
    game.currentPlayer = 0;
    const wild = { id: 'wild-card', color: 'wild', value: 'wild' };
    game.players[0].hand = [wild, { id: 'other', color: 'red', value: '2' }];
    expect(() => playCard(game, 0, wild.id)).toThrow('Scegli un colore valido');
    playCard(game, 0, wild.id, 'blue');
    expect(game.chosenColor).toBe('blue');
    expect(game.currentPlayer).toBe(1);
  });

  test('skips the next player and reverses direction', () => {
    const game = createGame(['Ada', 'Bot 1', 'Bot 2']);
    game.currentPlayer = 0;
    game.direction = 1;
    const skip = { id: 'skip', color: 'red', value: 'skip' };
    game.discardPile = [{ id: 'top', color: 'red', value: '5' }];
    game.players[0].hand = [skip, { id: 'extra', color: 'blue', value: '1' }];
    playCard(game, 0, skip.id);
    expect(game.currentPlayer).toBe(2);

    const reverseGame = createGame(['Ada', 'Bot 1', 'Bot 2']);
    reverseGame.currentPlayer = 0;
    reverseGame.direction = 1;
    const reverse = { id: 'reverse', color: 'yellow', value: 'reverse' };
    reverseGame.discardPile = [{ id: 'top', color: 'yellow', value: '5' }];
    reverseGame.players[0].hand = [reverse, { id: 'extra', color: 'red', value: '1' }];
    playCard(reverseGame, 0, reverse.id);
    expect(reverseGame.direction).toBe(-1);
    expect(reverseGame.currentPlayer).toBe(2);
  });

  test('reverse acts as a skip in a two-player game', () => {
    const game = createGame(['Ada', 'Bot']);
    game.currentPlayer = 0;
    const reverse = { id: 'reverse', color: 'red', value: 'reverse' };
    game.discardPile = [{ id: 'top', color: 'red', value: '5' }];
    game.players[0].hand = [reverse, { id: 'extra', color: 'blue', value: '1' }];
    playCard(game, 0, reverse.id);
    expect(game.currentPlayer).toBe(0);
    expect(game.direction).toBe(-1);
  });

  test('draw cards stack and accepting the penalty passes the turn', () => {
    const game = createGame(['Ada', 'Bot']);
    game.currentPlayer = 0;
    const plusTwo = { id: 'plus-two', color: 'red', value: 'draw2' };
    game.discardPile = [{ id: 'top', color: 'red', value: '5' }];
    game.players[0].hand = [plusTwo, { id: 'extra', color: 'blue', value: '1' }];
    playCard(game, 0, plusTwo.id);
    expect(game.pendingDraw).toBe(2);
    game.drawPile = [{ id: 'draw-a', color: 'blue', value: '1' }, { id: 'draw-b', color: 'green', value: '2' }];
    const count = drawCards(game, 1);
    expect(count).toBe(2);
    expect(game.pendingDraw).toBe(0);
    expect(game.currentPlayer).toBe(0);
  });

  test('draw penalties can pass without stacking when stacking is disabled', () => {
    const game = createGame(['Ada', 'Bot'], { stacking: false });
    game.currentPlayer = 0;
    game.discardPile = [{ id: 'top', color: 'red', value: '5' }];
    const plusTwo = { id: 'plus-two', color: 'red', value: 'draw2' };
    game.players[0].hand = [plusTwo, { id: 'extra', color: 'blue', value: '1' }];
    playCard(game, 0, plusTwo.id);
    expect(game.pendingDraw).toBe(2);
    expect(game.currentPlayer).toBe(1);
    expect(getPlayableCards(game, 1)).toEqual([]);
  });

  test('declares a winner when the last card is played', () => {
    const game = createGame(['Ada', 'Bot']);
    game.currentPlayer = 0;
    game.discardPile = [{ id: 'top', color: 'red', value: '2' }];
    game.players[0].hand = [{ id: 'last', color: 'red', value: '8' }];
    expect(playCard(game, 0, 'last').winner).toBe(0);
    expect(game.status).toBe('finished');
  });

  test('chooses bot profiles by rating and returns a legal move', () => {
    expect(getBotProfile(200).name).toBe('AGGR');
    expect(getBotProfile(499).name).toBe('AGGR');
    expect(getBotProfile(500).name).toBe('CONS');
    expect(getBotProfile(1299).name).toBe('CONS');
    expect(getBotProfile(800).name).toBe('CONS');
    expect(getBotProfile(1300).name).toBe('STRAT');
    expect(getBotProfile(1600).name).toBe('STRAT');
    expect(getBotProfile(200).color).toBe('#ff4466');
    expect(getBotProfile(800).color).toBe('#7EE4F8');
    expect(getBotProfile(1600).color).toBe('#00ff88');
    const game = createGame(['Ada', 'Bot']);
    const move = chooseBotMove(game, 1, () => 0.5);
    expect(['draw', 'play']).toContain(move.type);
    if (move.type === 'play') {
      expect(getPlayableCards(game, 1).some((card) => card.id === move.cardId)).toBe(true);
    }
  });

  test('STRAT considers opponent color gaps when choosing a wild color', () => {
    const game = createGame(['Ada', 'Stratega', 'Rivale']);
    game.currentPlayer = 1;
    game.discardPile = [{ id: 'top', color: 'yellow', value: '5' }];
    game.players[1].mmr = 1600;
    game.players[1].hand = [
      { id: 'wild', color: 'wild', value: 'wild' },
      { id: 'red-a', color: 'red', value: '7' },
      { id: 'red-b', color: 'red', value: '3' },
      { id: 'green', color: 'green', value: '2' }
    ];
    game.players[0].hand = [{ id: 'opponent-red', color: 'red', value: '1' }];
    game.players[2].hand = [{ id: 'rival-red', color: 'red', value: '8' }];

    expect(chooseBotMove(game, 1, () => 0.5)).toEqual({
      type: 'play',
      cardId: 'wild',
      color: 'green'
    });
  });

  test('maps ratings to bot difficulty and response-time ranges', () => {
    expect([399, 400, 700, 1000].map(getBotDifficulty)).toEqual(['easy', 'normal', 'hard', 'ultra']);
    expect(getBotThinkTime(200, () => 0)).toBe(400);
    expect(getBotThinkTime(200, () => 0.999)).toBe(800);
    expect(getBotThinkTime(1400, () => 0)).toBe(1100);
    expect(getBotThinkTime(1400, () => 0.999)).toBe(2099);
  });

  test('bot draws when it cannot play and prefers a draw card during a penalty', () => {
    const game = createGame(['Ada', 'Bot'], { mmrs: [200, 1400] });
    game.discardPile = [{ id: 'top', color: 'red', value: '5' }];
    game.players[1].hand = [
      { id: 'green', color: 'green', value: '1' },
      { id: 'plus-two', color: 'blue', value: 'draw2' }
    ];
    expect(chooseBotMove(game, 1, () => 0).type).toBe('draw');

    game.pendingDraw = 2;
    game.currentPlayer = 1;
    const move = chooseBotMove(game, 1, () => 0);
    expect(move).toMatchObject({ type: 'play', cardId: 'plus-two' });
  });

  test('passes the turn only for the active player', () => {
    const game = createGame(['Ada', 'Bot']);
    game.currentPlayer = 0;
    game.players[0].hand = [{ id: 'drawn', color: 'green', value: '3' }];
    game.justDrawnCardId = 'drawn';
    passTurn(game, 0);
    expect(game.currentPlayer).toBe(1);
    expect(game.justDrawnCardId).toBeNull();
    expect(() => passTurn(game, 0)).toThrow('Non è il turno');
  });
});
