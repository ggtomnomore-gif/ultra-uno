describe('profilo e Battle Card', () => {
  it('shows account statistics and opens the Battle Card from lobby navigation', () => {
    cy.intercept('GET', '/api/auth/me', {
      statusCode: 200,
      body: {
        user: {
          id: '1',
          username: 'Tester',
          created_at: '2026-01-15T12:00:00.000Z',
          stats: [
            { mode: 'uno', mmr: 240, rank: 'Bronze I', gamesPlayed: 3, wins: 2 },
            { mode: 'scopa', mmr: 200, rank: 'Bronze I', gamesPlayed: 0, wins: 0 }
          ]
        }
      }
    });
    cy.intercept('GET', '/api/battle-card', {
      statusCode: 200,
      body: {
        season: { id: 'ultra-season-1', name: 'Stagione Uno' },
        level: 2,
        maxLevel: 3,
        experience: 150,
        experiencePerLevel: 100,
        premiumUnlocked: false,
        prices: { standard: 1000, boosted: 1500 },
        credits: 500,
        rewards: [{ level: 1, track: 'free', credits: 50, claimed: false }]
      }
    });
    cy.visit('/', {
      onBeforeLoad(window) {
        window.localStorage.setItem('uno-ultra-token', 'e2e-test-token');
      }
    });
    cy.get('#lobby-screen').should('be.visible');
    cy.get('.top-tab[data-section="career"]').click();
    cy.get('#profile-panel').should('be.visible');
    cy.get('#profile-username').should('have.text', 'Tester');
    cy.get('#profile-mmr').should('have.text', '240 MMR');
    cy.get('#profile-stats .profile-stat-card').should('have.length', 2);
    cy.get('.top-tab[data-section="pass"]').click();
    cy.get('#battle-card-panel').should('be.visible');
    cy.get('#battle-card-progress').should('contain.text', 'Stagione Uno');
    cy.get('#battle-card-levels .battle-level').should('have.length', 3);
    cy.get('#battle-card-levels').should('contain.text', 'GRATIS · 50 V');
  });
});
