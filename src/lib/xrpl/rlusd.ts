/**
 * RLUSD (Ripple USD) on the XRP Ledger — reference constants.
 * Issuer address as published by Ripple: https://docs.ripple.com/products/stablecoin/overview/token-addresses
 * The UI additionally checks the issuer's on-ledger Domain field live and shows the result.
 */
export const RLUSD_ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
/** "RLUSD" as a 160-bit (40 hex) non-standard currency code. */
export const RLUSD_CURRENCY_HEX = "524C555344000000000000000000000000000000";
export const RLUSD_SOURCE_URL = "https://docs.ripple.com/products/stablecoin/overview/token-addresses";
export const RLUSD_EXPECTED_DOMAIN = "ripple.com";
export const RLUSD_DISCLAIMER = "RLUSD activity does not imply XRP price movement.";
