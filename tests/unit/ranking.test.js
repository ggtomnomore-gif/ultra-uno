'use strict';

const {
  getRank,
  getKFactor,
  calculateMatchResult,
  calculateMultiplayerMatchResult
} = require('../../backend/services/ranking');

describe('MMR ranking', () => {
  test.each([
    [0, 'Bronze I'], [299, 'Bronze I'], [300, 'Bronze II'], [499, 'Bronze II'],
    [500, 'Silver I'], [700, 'Silver II'], [900, 'Gold I'], [1100, 'Gold II'],
    [1300, 'Platinum'], [1600, 'Diamond'], [2000, 'Champion'], [2500, 'Grand Champion'], [3000, 'SSL']
  ])('maps %i MMR to %s', (mmr, expectedRank) => {
    expect(getRank(mmr)).toBe(expectedRank);
  });

  test.each([[499, 40], [500, 28], [999, 28], [1000, 20], [1999, 20], [2000, 16]])(
    'uses the specified K factor at %i MMR', (mmr, factor) => {
      expect(getKFactor(mmr)).toBe(factor);
    }
  );

  test('rewards a win and reduces the losing rating without exceeding delta bounds', () => {
    const result = calculateMatchResult(200, 200);
    expect(result.winner).toEqual({ before: 200, delta: 20, after: 220, rank: 'Bronze I' });
    expect(result.loser).toEqual({ before: 200, delta: -20, after: 180, rank: 'Bronze I' });

    const upset = calculateMatchResult(0, 3000);
    expect(upset.winner.delta).toBe(40);
    expect(upset.loser.delta).toBe(-16);
    const expectedWin = calculateMatchResult(3000, 0);
    expect(expectedWin.winner.delta).toBe(5);
    expect(expectedWin.loser.delta).toBe(0);
  });

  test('rejects invalid MMR values', () => {
    expect(() => calculateMatchResult(-1, 200)).toThrow('MMR non valido');
    expect(() => calculateMatchResult(200.5, 200)).toThrow('MMR non valido');
  });

  test('calculates persistent rating changes for two- and four-player matches', () => {
    expect(calculateMultiplayerMatchResult([
      { userId: '1', mmr: 200 },
      { userId: '2', mmr: 200 }
    ], '1')).toEqual([
      { userId: '1', before: 200, delta: 20, after: 220, rank: 'Bronze I', won: true },
      { userId: '2', before: 200, delta: -20, after: 180, rank: 'Bronze I', won: false }
    ]);
    const multiplayer = calculateMultiplayerMatchResult([
      { userId: '1', mmr: 200 },
      { userId: '2', mmr: 200 },
      { userId: '3', mmr: 200 },
      { userId: '4', mmr: 200 }
    ], '1');
    expect(multiplayer[0].delta).toBeGreaterThan(0);
    expect(multiplayer.slice(1).every((result) => result.delta < 0)).toBe(true);
    expect(multiplayer.filter((result) => result.won)).toHaveLength(1);
  });

  test('rejects malformed multiplayer results', () => {
    expect(() => calculateMultiplayerMatchResult([], '1')).toThrow('Risultato partita non valido');
    expect(() => calculateMultiplayerMatchResult([
      { userId: '1', mmr: 200 },
      { userId: '1', mmr: 200 }
    ], '1')).toThrow('Risultato partita non valido');
    expect(() => calculateMultiplayerMatchResult([
      { userId: '1', mmr: -1 },
      { userId: '2', mmr: 200 }
    ], '1')).toThrow('Risultato partita non valido');
  });
});
