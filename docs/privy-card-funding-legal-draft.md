# Card funding: draft legal text for review

Status: draft written by engineering on 2026-10-02 for qualified legal review. It is not legal advice, it is not published, and none of it may be copied into `legal/` before that review ([legal/README.md](../legal/README.md)). Owner: launch prerequisite 2 of [ADR 0034](adr/0034-privy-card-funding.md) and row CF-8 of the [launch checklist](privy-card-funding-launch-checklist.md).

The section and clause numbers below refer to the documents as last updated on October 1, 2026.

## What the feature does

These are the facts the reviewer needs. They come from the application code and from the published `@privy-io/react-auth` 3.46.0 bundle; nothing here was observed in a completed purchase.

- The Deposit dialog offers "Buy USDC with a card" next to "Transfer USDC". Choosing it closes the dialog and opens a purchase window that belongs to Privy, the wallet and authentication provider.
- Sairn's code passes Privy four things: the destination wallet address (always the user's own Hyperliquid owner wallet), the destination asset (native USDC on Arbitrum One), a default currency and amount (USD 100, editable in the window) and whether to use the provider sandbox.
- Privy routes the purchase to an independent payment provider. With the current Privy configuration these are Stripe (USD, EUR) and MoonPay (AUD, BRL). Stripe's flow runs inside the Privy window through Stripe's Link account; other providers open in a separate window.
- For the Stripe flow, Privy passes the user's sign-in e-mail address (and phone number, if the Privy account has one) to Stripe. The window then asks the user for a phone number, legal name, date of birth, residential address, nationality and national identifiers such as a US Social Security number or an EU tax or identity number, and may require a document and selfie check. Those fields are drawn by Privy's software inside the Sairn page and sent to the provider. Card details are entered in elements supplied by Stripe.
- Sairn's own code does not read, store or transmit those identity or payment details, and Sairn has no server that receives them. In the browser Sairn learns only how the flow ended: confirmed, submitted, failed, cancelled or unknown.
- The provider delivers USDC to the user's wallet on Arbitrum. Sairn cannot cancel, refund or reverse a purchase. The USDC is not in the trading account until the user makes a separate deposit; an external wallet pays Arbitrum network fees for that deposit.
- The entry is shown only where deposits are available, so Sairn's existing regional restrictions also apply to it. Provider coverage is narrower: Stripe's onramp is offered in the United States (excluding New York) and the European Union.

## Proposed changes

### Terms of Use

1. Section 1.6 (Third-Party Services): add "payment and fiat on-ramp providers" to the list of third-party services.
2. New section 1.8, or a new clause in Section 6:

   > **Card and Bank Purchases.** Where available, the Interface may let you buy digital assets with a card or bank transfer. These purchases are provided by independent third-party payment providers through our wallet provider, not by Sairn. The provider is the seller or payment processor, verifies your identity and payment details under its own terms and privacy policy, sets its own prices, fees, limits and processing times, and may decline, delay, cancel or refund a purchase. Sairn does not receive your card details, is not a party to the purchase, and cannot cancel, refund or reverse it. Purchased assets are delivered to your own wallet and are not credited to a trading account until you make a separate deposit.

3. Section 3.4 (Bridge, Deposit, and Withdrawal Risk): add "A purchase that a payment provider shows as submitted or confirmed may still be delayed, reversed or refunded by that provider and is not a deposit."
4. Section 6.1 (Applicable Fees): add "payment-provider fees, exchange-rate spreads and currency-conversion charges" to the list of third-party costs.
5. Section 6.3 (Irreversibility and Recovery): add that Sairn cannot cancel, refund or reverse a purchase made through a payment provider.

### Privacy Policy

1. Section 1 (Scope and Roles): add "payment and fiat on-ramp providers" to the independent third parties.
2. Section 2 (Personal Data We May Handle): add a bullet:

   > **Purchase information handled by payment providers:** if you buy digital assets with a card or bank transfer, the payment provider and our wallet provider collect the identity, contact and payment information they require, such as your name, date of birth, address, phone number, identification numbers or documents, and payment method. Our wallet provider shares your sign-in e-mail address and your wallet address with the payment provider to start the purchase. Sairn does not store this information and does not receive your card details.

3. Section 5 (When Data Is Shared): add "payment and fiat on-ramp providers, when you start a purchase".

### Risk Disclosure

Section 8 (Bridge, Deposit, Withdrawal, and Transfer Risk): add a paragraph:

> Card and bank purchases are carried out by independent payment providers. A provider may charge fees or an exchange-rate spread, apply limits, require identity verification, and decline, delay or refund a purchase. A purchase shown as confirmed is not proof that the assets have arrived, and purchased assets must still be deposited before they can be used for trading.

### Cookie and Browser Storage Policy

Section 2 (Third-Party Services): add "payment" to the list of providers that may set their own cookies or browser-storage records.

### Product documentation (`legal/docs.md`)

Under "Wallet & Account", once the feature is live: "**Buy USDC with a card** — where available, buy USDC through a third-party payment provider. It arrives in your wallet on Arbitrum; deposit it to start trading."

## Questions for counsel

1. Does offering a third-party purchase inside the Interface change the positions in Terms Sections 1.3 and 1.7 (no brokerage, exchange, custody or money transmission) in any jurisdiction where the entry will be available?
2. Must the provider's terms and privacy policy be linked or accepted in Sairn's own interface before the purchase window opens? Today only the provider's window presents them.
3. How should the roles be described under data-protection law, given that the identity fields are drawn by the wallet provider's software inside the Sairn page but are not read or stored by Sairn? Is "does not store" the accurate wording, or may the text say "does not receive"?
4. Is the disclosure that the sign-in e-mail address is passed to the payment provider sufficient, and is a separate notice needed at the moment the purchase starts?
5. Which consumer rights for card purchases (refunds, chargebacks, withdrawal rights in the European Union) need to be addressed, and by whom?
6. Is a statement needed about where the entry is offered, given Sairn's restricted-person rules and the narrower provider coverage?
7. Do the camera and wallet-payment restrictions in the current browser permissions policy (document capture inside the page and Apple Pay or Google Pay are blocked) raise any disclosure point?

## After approval

Update the source files in `legal/`, each Last Updated date, both route surfaces and their tests (`terms-content.test.ts`, `legal-policy-contract.test.ts`), then run `pnpm brand:check` and `pnpm test:brand`, as [legal/README.md](../legal/README.md) requires. Record the review in the launch checklist.
