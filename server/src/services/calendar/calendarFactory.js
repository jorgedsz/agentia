const GHLCalendarProvider = require('./GHLCalendarProvider');
const GoogleCalendarProvider = require('./GoogleCalendarProvider');
const CalendlyProvider = require('./CalendlyProvider');
const HubSpotCalendarProvider = require('./HubSpotCalendarProvider');
const CalComProvider = require('./CalComProvider');

const PROVIDERS = {
  ghl: GHLCalendarProvider,
  google: GoogleCalendarProvider,
  calendly: CalendlyProvider,
  hubspot: HubSpotCalendarProvider,
  calcom: CalComProvider
};

/**
 * Factory function to create the correct calendar provider instance.
 * @param {Object} integration - CalendarIntegration record from DB
 * @param {Object} prisma - Prisma client instance
 * @returns {CalendarProvider}
 */
function createCalendarProvider(integration, prisma) {
  const ProviderClass = PROVIDERS[integration.provider];
  if (!ProviderClass) {
    throw new Error(`Unknown calendar provider: ${integration.provider}`);
  }
  return new ProviderClass(integration, prisma);
}

/**
 * Get the list of supported provider identifiers.
 */
function getSupportedProviders() {
  return Object.keys(PROVIDERS);
}

module.exports = {
  createCalendarProvider,
  getSupportedProviders
};
