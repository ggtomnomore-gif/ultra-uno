(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.UnoEngine = factory();
  }
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const COLORS = ['red', 'blue', 'green', 'yellow'];
  const ACTIONS = ['skip', 'reverse', 'draw2'];
  const AI_PROFILES = {
    1: { name: 'AGGR', color: '#ff4466', weights: { drawEarly: 12, drawLate: 25, wildEarly: 5, wildLate: 18, numeric: -1 } },
    2: { name: 'CONS', color: '#7EE4F8', weights: { drawEarly: -18, drawLate: 22, wildEarly: -22, wildLate: 28, numeric: 7 } },
    3: { name: 'STRAT', color: '#00ff88', weights: { drawEarly: 8, drawLate: 16, wildEarly: 6, wildLate: 15, numeric: 0 } }
  };
  let nextCardId = 0;

  function createCard(color, value) {
    return { id: `card-${++nextCardId}`, color, value };
  }

  function createDeck(random = Math.random) {
    const deck = [];
    COLORS.forEach((color) => {
      deck.push(createCard(color, '0'));
      for (let value = 1; value <= 9; value += 1) {
        deck.push(createCard(color, String(value)), createCard(color, String(value)));
      }
      ACTIONS.forEach((action) => deck.push(createCard(color, action), createCard(color, action)));
    });
    for (let index = 0; index < 4; index += 1) {
      deck.push(createCard('wild', 'wild'), createCard('wild', 'wild4'));
    }
    for (let index = deck.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
    }
    return deck;
  }

  function createGame(playerNames, options = {}) {
    if (!Array.isArray(playerNames) || playerNames.length < 2 || playerNames.length > 4) {
      throw new RangeError('UNO richiede da 2 a 4 giocatori.');
    }
    const random = options.random || Math.random;
    const deck = createDeck(random);
    const players = playerNames.map((name, index) => ({
      name: String(name).slice(0, 15),
      isHuman: index === 0,
      mmr: options.mmrs?.[index] ?? 200,
      hand: deck.splice(0, 7)
    }));
    let firstCard = deck.shift();
    while (firstCard && firstCard.color === 'wild') {
      deck.push(firstCard);
      firstCard = deck.shift();
    }
    const state = {
      players,
      drawPile: deck,
      discardPile: [firstCard],
      currentPlayer: 0,
      direction: 1,
      pendingDraw: 0,
      chosenColor: null,
      stacking: options.stacking !== false,
      justDrawnCardId: null,
      status: 'playing',
      winner: null
    };
    if (firstCard.value === 'skip') {
      state.currentPlayer = 1;
    } else if (firstCard.value === 'reverse') {
      state.direction = -1;
      state.currentPlayer = players.length === 2 ? 0 : players.length - 1;
    } else if (firstCard.value === 'draw2') {
      state.players[0].hand.push(...drawFromPile(state, 2));
      state.currentPlayer = 1;
    }
    return state;
  }

  function topCard(state) {
    return state.discardPile[state.discardPile.length - 1];
  }

  function canPlayWildFour(state, hand) {
    const activeColor = state.chosenColor || topCard(state).color;
    return !hand.some((card) => card.color === activeColor);
  }

  function getPlayableCards(state, playerIndex) {
    const player = state.players[playerIndex];
    if (!player || state.status !== 'playing') return [];
    return player.hand.filter((card) => {
      if (playerIndex === state.currentPlayer && state.justDrawnCardId && card.id !== state.justDrawnCardId) return false;
      if (state.pendingDraw > 0) {
        return state.stacking && (card.value === 'draw2' || (card.value === 'wild4' && canPlayWildFour(state, player.hand)));
      }
      const top = topCard(state);
      if (card.value === 'wild4' && !canPlayWildFour(state, player.hand)) return false;
      return card.color === 'wild' || card.color === (state.chosenColor || top.color) || card.value === top.value;
    });
  }

  function drawFromPile(state, amount) {
    const drawn = [];
    while (drawn.length < amount) {
      if (state.drawPile.length === 0) {
        if (state.discardPile.length <= 1) break;
        const top = state.discardPile.pop();
        state.drawPile = state.discardPile.splice(0);
        state.discardPile.push(top);
        for (let index = state.drawPile.length - 1; index > 0; index -= 1) {
          const swapIndex = Math.floor(Math.random() * (index + 1));
          [state.drawPile[index], state.drawPile[swapIndex]] = [state.drawPile[swapIndex], state.drawPile[index]];
        }
      }
      const card = state.drawPile.pop();
      if (card) drawn.push(card);
    }
    return drawn;
  }

  function nextIndex(state, steps = 1) {
    const count = state.players.length;
    return (state.currentPlayer + state.direction * steps % count + count) % count;
  }

  function drawCards(state, playerIndex, amount = 1) {
    if (state.status !== 'playing' || playerIndex !== state.currentPlayer) {
      throw new Error('Non è il turno di questo giocatore.');
    }
    if (state.pendingDraw > 0) {
      const total = state.pendingDraw;
      state.players[playerIndex].hand.push(...drawFromPile(state, total));
      state.pendingDraw = 0;
      state.justDrawnCardId = null;
      state.currentPlayer = nextIndex(state);
      return total;
    }
    const [card] = drawFromPile(state, amount);
    if (card) {
      state.players[playerIndex].hand.push(card);
      state.justDrawnCardId = card.id;
    }
    return card ? 1 : 0;
  }

  function passTurn(state, playerIndex) {
    if (state.status !== 'playing' || playerIndex !== state.currentPlayer) {
      throw new Error('Non è il turno di questo giocatore.');
    }
    state.justDrawnCardId = null;
    state.currentPlayer = nextIndex(state);
  }

  function playCard(state, playerIndex, cardId, selectedColor) {
    if (state.status !== 'playing' || playerIndex !== state.currentPlayer) {
      throw new Error('Non è il turno di questo giocatore.');
    }
    const player = state.players[playerIndex];
    const cardIndex = player.hand.findIndex((card) => card.id === cardId);
    if (cardIndex < 0) throw new Error('Questa carta non è nella tua mano.');
    const card = player.hand[cardIndex];
    if (!getPlayableCards(state, playerIndex).some((playable) => playable.id === card.id)) {
      throw new Error('Questa carta non può essere giocata adesso.');
    }
    if (card.color === 'wild' && !COLORS.includes(selectedColor)) {
      throw new Error('Scegli un colore valido per la carta jolly.');
    }
    player.hand.splice(cardIndex, 1);
    state.discardPile.push(card);
    state.chosenColor = card.color === 'wild' ? selectedColor : null;
    state.justDrawnCardId = null;

    if (player.hand.length === 0) {
      state.status = 'finished';
      state.winner = playerIndex;
      return { card, winner: playerIndex };
    }
    if (card.value === 'draw2' || card.value === 'wild4') {
      state.pendingDraw += card.value === 'draw2' ? 2 : 4;
      if (card.value === 'wild4' && !state.stacking) state.pendingDraw = 4;
      if (state.stacking) {
        state.currentPlayer = nextIndex(state);
        return { card };
      }
    } else if (card.value === 'reverse') {
      state.direction *= -1;
      if (state.players.length === 2) state.currentPlayer = nextIndex(state, 2);
    } else if (card.value === 'skip') {
      state.currentPlayer = nextIndex(state, 2);
      return { card };
    }
    if (card.value !== 'reverse' || state.players.length !== 2) {
      state.currentPlayer = nextIndex(state);
    }
    return { card };
  }

  function getBotProfile(mmr = 200) {
    if (mmr < 500) return AI_PROFILES[1];
    if (mmr < 1300) return AI_PROFILES[2];
    return AI_PROFILES[3];
  }

  function getBotDifficulty(mmr = 200) {
    if (mmr < 400) return 'easy';
    if (mmr < 700) return 'normal';
    if (mmr < 1000) return 'hard';
    return 'ultra';
  }

  function getBotThinkTime(mmr = 200, random = Math.random) {
    const ranges = {
      easy: [400, 800],
      normal: [700, 1300],
      hard: [900, 1700],
      ultra: [1100, 2100]
    };
    const [minimum, maximum] = ranges[getBotDifficulty(mmr)];
    return minimum + Math.floor(random() * (maximum - minimum + 1));
  }

  function chooseBotMove(state, playerIndex, random = Math.random) {
    const player = state.players[playerIndex];
    const playable = getPlayableCards(state, playerIndex);
    if (playable.length === 0) return { type: 'draw' };
    const profile = getBotProfile(player.mmr);
    const lateGame = player.hand.length <= 3;
    const scored = playable.map((card) => {
      const sameColor = player.hand.filter((handCard) => handCard.color === card.color).length;
      let score = random() * 8 - 4;
      if (card.value === 'draw2' || card.value === 'wild4') score += state.pendingDraw > 0 ? 60 : lateGame ? profile.weights.drawLate : profile.weights.drawEarly;
      else if (card.color === 'wild') score += lateGame ? profile.weights.wildLate : profile.weights.wildEarly;
      else score += profile.weights.numeric + sameColor;
      return { card, score };
    }).sort((left, right) => right.score - left.score);
    const selected = scored[0].card;
    const colorScores = COLORS.map((color) => ({
      color,
      count: player.hand.filter((card) => card.color === color).length,
      opponentCount: state.players.reduce((total, opponent, index) => (
        index === playerIndex
          ? total
          : total + opponent.hand.filter((card) => card.color === color).length
      ), 0)
    })).map((entry) => ({
      ...entry,
      score: entry.count + (profile.name === 'STRAT' && entry.opponentCount === 0 ? 2 : 0)
    })).sort((left, right) => right.score - left.score || right.count - left.count);
    return { type: 'play', cardId: selected.id, color: selected.color === 'wild' ? colorScores[0].color : undefined };
  }

  return {
    COLORS, createDeck, createGame, getPlayableCards, drawCards, passTurn, playCard,
    chooseBotMove, getBotProfile, getBotDifficulty, getBotThinkTime
  };
}));
