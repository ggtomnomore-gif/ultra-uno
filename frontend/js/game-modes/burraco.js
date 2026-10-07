(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./italian-deck'), require('./melds'));
  } else {
    root.BurracoEngine = factory(root.ItalianDeck, root.CardMelds);
  }
}(typeof globalThis === 'object' ? globalThis : this, function (deckTools, melds) {
  'use strict';

  function createGame(playerNames, random = Math.random) {
    if (!Array.isArray(playerNames) || playerNames.length !== 4) throw new RangeError('Burraco richiede quattro giocatori in due coppie.');
    const deck = deckTools.createFrenchDeck(2, 2, random);
    const players = playerNames.map((name, index) => ({
      name,
      team: index % 2,
      hand: deck.splice(0, 11),
      melds: [],
      pozzetto: []
    }));
    players[0].pozzetto = deck.splice(0, 11);
    players[1].pozzetto = deck.splice(0, 11);
    return { deck, discardPile: [], players, currentPlayer: 0, status: 'playing', winner: null, drawn: false };
  }

  function draw(state, playerIndex, fromDiscard = false) {
    if (state.status !== 'playing' || state.currentPlayer !== playerIndex || state.drawn) throw new Error('Non puoi pescare adesso.');
    const player = state.players[playerIndex];
    if (player.hand.length === 0 && player.pozzetto.length > 0) {
      player.hand = player.pozzetto.splice(0);
    } else if (fromDiscard) {
      if (state.discardPile.length === 0) throw new Error('Il monte degli scarti è vuoto.');
      player.hand.push(...state.discardPile.splice(0));
    } else {
      if (state.deck.length === 0) throw new Error('Il mazzo è esaurito.');
      player.hand.push(state.deck.pop());
    }
    state.drawn = true;
  }

  function layMeld(state, playerIndex, cardIds) {
    const player = state.players[playerIndex];
    if (state.status !== 'playing' || state.currentPlayer !== playerIndex || !state.drawn) throw new Error('Pesca prima di calare una combinazione.');
    if (!player || !Array.isArray(cardIds)) throw new Error('Mossa non valida.');
    const cards = cardIds.map((id) => player.hand.find((card) => card.id === id));
    if (cards.some((card) => !card) || !melds.getMeldType(cards)) throw new Error('La combinazione non è valida.');
    const selectedIds = new Set(cardIds);
    player.hand = player.hand.filter((card) => !selectedIds.has(card.id));
    player.melds.push(cards);
    return { type: melds.getMeldType(cards), burraco: cards.length >= 7 };
  }

  function takePozzetto(state, playerIndex) {
    const player = state.players[playerIndex];
    if (state.status !== 'playing' || state.currentPlayer !== playerIndex || !player || player.hand.length !== 0 || player.pozzetto.length === 0) {
      throw new Error('Non puoi prendere il pozzetto adesso.');
    }
    player.hand = player.pozzetto.splice(0);
    state.drawn = true;
    return player.hand.length;
  }

  function discard(state, playerIndex, cardId) {
    const player = state.players[playerIndex];
    if (state.status !== 'playing' || state.currentPlayer !== playerIndex || !state.drawn) throw new Error('Pesca prima di scartare.');
    const index = player?.hand.findIndex((card) => card.id === cardId) ?? -1;
    if (index < 0) throw new Error('La carta non è nella tua mano.');
    state.discardPile.push(player.hand.splice(index, 1)[0]);
    state.currentPlayer = (playerIndex + 1) % state.players.length;
    state.drawn = false;
  }

  return { createGame, draw, layMeld, takePozzetto, discard, getMeldType: melds.getMeldType };
}));
