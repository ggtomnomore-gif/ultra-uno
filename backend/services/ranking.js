'use strict';

const RANK_DIVISIONS = [
  { min: 3000, name: 'SSL' },
  { min: 2500, name: 'Grand Champion' },
  { min: 2000, name: 'Champion' },
  { min: 1600, name: 'Diamond' },
  { min: 1300, name: 'Platinum' },
  { min: 1100, name: 'Gold II' },
  { min: 900, name: 'Gold I' },
  { min: 700, name: 'Silver II' },
  { min: 500, name: 'Silver I' },
  { min: 300, name: 'Bronze II' },
  { min: 0, name: 'Bronze I' }
];

function getRank(mmr) {
  const division = RANK_DIVISIONS.find((entry) => mmr >= entry.min);
  return division ? division.name : 'Bronze I';
}

function getKFactor(mmr) {
  if (mmr < 500) return 40;
  if (mmr < 1000) return 28;
  if (mmr < 2000) return 20;
  return 16;
}

function calculateMatchResult(winnerMmr, loserMmr) {
  if (!Number.isInteger(winnerMmr) || !Number.isInteger(loserMmr) || winnerMmr < 0 || loserMmr < 0) {
    throw new RangeError('MMR non valido.');
  }
  const expectedWinner = 1 / (1 + 10 ** ((loserMmr - winnerMmr) / 400));
  const winnerDelta = Math.min(50, Math.max(5, Math.round(getKFactor(winnerMmr) * (1 - expectedWinner))));
  const loserDelta = -Math.min(50, Math.max(5, Math.round(getKFactor(loserMmr) * (1 - expectedWinner))));
  const winnerAfter = winnerMmr + winnerDelta;
  const loserAfter = Math.max(0, loserMmr + loserDelta);
  return {
    winner: { before: winnerMmr, delta: winnerAfter - winnerMmr, after: winnerAfter, rank: getRank(winnerAfter) },
    loser: { before: loserMmr, delta: loserAfter - loserMmr, after: loserAfter, rank: getRank(loserAfter) }
  };
}

function calculateMultiplayerMatchResult(players, winnerUserId) {
  if (
    !Array.isArray(players)
    || players.length < 2
    || !players.some((player) => player.userId === winnerUserId)
    || new Set(players.map((player) => player.userId)).size !== players.length
    || players.some((player) => !player || typeof player !== 'object'
      || typeof player.userId !== 'string'
      || !Number.isInteger(player.mmr) || player.mmr < 0)
  ) {
    throw new RangeError('Risultato partita non valido.');
  }

  return players.map((player) => {
    const scoreDifference = players.reduce((total, opponent) => {
      if (opponent.userId === player.userId) return total;
      const expected = 1 / (1 + 10 ** ((opponent.mmr - player.mmr) / 400));
      const actual = player.userId === winnerUserId
        ? 1
        : opponent.userId === winnerUserId ? 0 : 0.5;
      return total + actual - expected;
    }, 0) / (players.length - 1);
    const rawDelta = Math.round(getKFactor(player.mmr) * scoreDifference);
    const boundedDelta = rawDelta === 0
      ? 0
      : Math.sign(rawDelta) * Math.min(50, Math.max(5, Math.abs(rawDelta)));
    const after = Math.max(0, player.mmr + boundedDelta);
    return {
      userId: player.userId,
      before: player.mmr,
      delta: after - player.mmr,
      after,
      rank: getRank(after),
      won: player.userId === winnerUserId
    };
  });
}

module.exports = { getRank, getKFactor, calculateMatchResult, calculateMultiplayerMatchResult };
