# Deploy fixtures

`mobile-device-evidence.mjs` builds the device-validation evidence document used by `scripts/validate-mobile-phone-access-device-validation.test.js`.

The legacy one-time-ticket client and server fixtures were removed together with the ticket endpoint when phone pairing became a client-only transfer ([ADR 0015](../../docs/adr/0015-link-device-alignment.md) D7, [plan](../../docs/mobile-sync-ticketless-transfer-plan.md)).
