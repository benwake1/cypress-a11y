import 'cypress-axe';
import 'cypress-real-events';
import '@testing-library/cypress/add-commands';
import '@cypress-audit/lighthouse/commands';
import './commands';

// Third-party scripts (analytics, chat, reviews) on a live site throw errors
// that have nothing to do with accessibility. Don't let them fail the run.
Cypress.on('uncaught:exception', () => false);
