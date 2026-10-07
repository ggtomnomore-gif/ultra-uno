(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./italian-deck'));
  } else {
    root.RubaMazzettoEngine = factory(root.ItalianDeck);
  }
}(typeof globalThis === 'object' ? globalThis : this, function (deckTools) {
  'use strict';

  function createGame(playerNames, random = Math.random) {
    if (!Array.isArray(playerNames) || playerNames.length < 2 || playerNames.length > 4) {
      throw new RangeError('Ruba Mazzetto richiede da 2 a 4 giocatori.');
    }
    const deck = deckTools.createItalianDeck(random);
    const players = playerNames.map((name) => ({ name, hand: [], pile: [] }));
    players.forEach((player, index) => {
      player.hand = deck.splice(0, Math.ceil(deck.length / (players.length - index)));
    });
    return { deck, players, currentPlayer: 0, status: 'playing' };
  }

  function playCard(state, playerIndex, cardId, targetPlayerIndex = null) {
    if (state.status !== 'playing' || playerIndex !== state.currentPlayer) throw new Error('Non è il turno di questo giocatore.');
    const player = state.players[playerIndex];
    const handIndex = player.hand.findIndex((card) => card.id === cardId);
    if (handIndex < 0) throw new Error('La carta non è nella tua mano.');
    const card = player.hand.splice(handIndex, 1)[0];
    const target = targetPlayerIndex === null
      ? state.players.find((candidate, index) => index !== playerIndex && candidate.pile.at(-1)?.rank === card.rank)
      : state.players[targetPlayerIndex];
    if (target && target !== player && target.pile.at(-1)?.rank === card.rank) {
      player.pile.push(...target.pile.splice(0), card);
    } else {
      player.pile.push(card);
    }
    state.currentPlayer = (playerIndex + 1) % state.players.length;
    if (state.players.every((candidate) => candidate.hand.length === 0)) state.status = 'finished';
    return { stolen: Boolean(target && target !== player && target.pile.length === 0), status: state.status };
  }

  return { createGame, playCard };
}));
