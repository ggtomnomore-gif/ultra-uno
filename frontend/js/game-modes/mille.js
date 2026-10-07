(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MilleEngine = factory();
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const DISTANCES = [[25, 10], [50, 10], [75, 10], [100, 12], [200, 4]];
  const HAZARDS = [['stop', 5], ['speed-limit', 3], ['accident', 3], ['flat-tire', 3], ['out-of-gas', 3]];
  const REMEDIES = [['roll', 15], ['end-speed-limit', 6], ['repairs', 6], ['spare-tire', 6], ['gasoline', 6]];
  const SAFETIES = ['right-of-way', 'driving-ace', 'extra-tank', 'puncture-proof'];
  const CARD_TYPES = new Set([
    ...DISTANCES.map(([distance]) => `distance:${distance}`),
    ...HAZARDS.map(([type]) => type),
    ...REMEDIES.map(([type]) => type),
    ...SAFETIES
  ]);
  let nextId = 0;

  function createDeck(random = Math.random) {
    const cards = [];
    const add = (type, count, distance = 0) => {
      for (let index = 0; index < count; index += 1) cards.push({ id: `mille-${++nextId}`, type, distance });
    };
    DISTANCES.forEach(([distance, count]) => add('distance', count, distance));
    HAZARDS.forEach(([type, count]) => add(type, count));
    REMEDIES.forEach(([type, count]) => add(type, count));
    SAFETIES.forEach((type) => add(type, 1));
    for (let index = cards.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
    }
    return cards;
  }

  function createGame(playerNames, random = Math.random) {
    if (!Array.isArray(playerNames) || playerNames.length !== 2) throw new RangeError('Millemiglia richiede due giocatori.');
    const deck = createDeck(random);
    const players = playerNames.map((name) => ({
      name,
      hand: deck.splice(0, 3),
      distance: 0,
      moving: false,
      stopped: true,
      speedLimited: false,
      usedTwoHundred: 0,
      safeties: []
    }));
    return { deck, players, currentPlayer: 0, status: 'playing', winner: null, drawn: false };
  }

  function draw(state, playerIndex) {
    if (state.status !== 'playing' || state.currentPlayer !== playerIndex || state.drawn) {
      throw new Error('Non puoi pescare adesso.');
    }
    const card = state.deck.pop();
    if (!card) throw new Error('Il mazzo è esaurito.');
    state.players[playerIndex].hand.push(card);
    state.drawn = true;
    return card;
  }

  function nextTurn(state) {
    state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
    state.drawn = false;
  }

  function playCard(state, playerIndex, cardId, targetIndex = (playerIndex + 1) % state.players.length) {
    if (state.status !== 'playing' || state.currentPlayer !== playerIndex || !state.drawn) throw new Error('Pesca prima di giocare.');
    const player = state.players[playerIndex];
    const handIndex = player.hand.findIndex((card) => card.id === cardId);
    if (handIndex < 0) throw new Error('La carta non è nella tua mano.');
    const card = player.hand[handIndex];
    if (!CARD_TYPES.has(card.type === 'distance' ? `distance:${card.distance}` : card.type)) {
      throw new Error('Tipo di carta non valido.');
    }
    const opponent = state.players[targetIndex];

    if (card.type === 'distance') {
      if (!player.moving || player.stopped) throw new Error('Prima gioca una carta di marcia.');
      if (player.speedLimited && card.distance > 50) throw new Error('Il limite di velocità consente solo carte da 25 o 50.');
      if (player.distance + card.distance > 1000) throw new Error('Non puoi superare i 1000 punti.');
      if (card.distance === 200 && player.usedTwoHundred >= 2) throw new Error('Puoi giocare al massimo due carte da 200.');
      player.distance += card.distance;
      if (card.distance === 200) player.usedTwoHundred += 1;
      if (player.distance === 1000) {
        state.status = 'finished';
        state.winner = playerIndex;
      }
    } else if (card.type === 'roll') {
      if (!player.stopped && player.moving) throw new Error('Sei già in marcia.');
      player.stopped = false;
      player.moving = true;
    } else if (card.type === 'end-speed-limit') {
      player.speedLimited = false;
    } else if (card.type === 'repairs' || card.type === 'spare-tire' || card.type === 'gasoline') {
      const required = { repairs: 'accident', 'spare-tire': 'flat-tire', gasoline: 'out-of-gas' }[card.type];
      if (!player.stopped || player.lastHazard !== required) throw new Error('Rimedio non compatibile con l’ultimo imprevisto.');
      player.stopped = false;
      player.moving = true;
      player.lastHazard = null;
    } else if (SAFETIES.includes(card.type)) {
      if (player.safeties.includes(card.type)) throw new Error('Questa sicurezza è già stata giocata.');
      player.safeties.push(card.type);
      if (card.type === 'right-of-way') {
        player.speedLimited = false;
        player.stopped = false;
        player.moving = true;
      }
    } else {
      if (!opponent || targetIndex === playerIndex || !opponent.moving || opponent.stopped) {
        throw new Error('Non c’è un avversario in marcia da fermare.');
      }
      if (opponent.safeties.includes({
        stop: 'right-of-way',
        'speed-limit': 'right-of-way',
        accident: 'driving-ace',
        'flat-tire': 'puncture-proof',
        'out-of-gas': 'extra-tank'
      }[card.type])) throw new Error('L’avversario è protetto da una carta sicurezza.');
      if (card.type === 'speed-limit') opponent.speedLimited = true;
      else {
        opponent.stopped = true;
        opponent.moving = false;
        opponent.lastHazard = card.type;
      }
    }

    player.hand.splice(handIndex, 1);
    nextTurn(state);
    return { distance: player.distance, winner: state.winner };
  }

  function discardCard(state, playerIndex, cardId) {
    if (state.status !== 'playing' || state.currentPlayer !== playerIndex || !state.drawn) throw new Error('Pesca prima di scartare.');
    const player = state.players[playerIndex];
    const index = player.hand.findIndex((card) => card.id === cardId);
    if (index < 0) throw new Error('La carta non è nella tua mano.');
    player.hand.splice(index, 1);
    nextTurn(state);
  }

  return { createDeck, createGame, draw, playCard, discardCard };
}));
