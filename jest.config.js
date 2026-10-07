module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  collectCoverageFrom: [
    'frontend/js/game-engine.js',
    'frontend/js/game-modes/{blackjack,burraco,italian-deck,meld,mille,poker,ruba-mazzetto,scala40,scopa}.js'
  ],
  coverageThreshold: {
    global: { lines: 80, functions: 80, branches: 75, statements: 80 }
  }
};
