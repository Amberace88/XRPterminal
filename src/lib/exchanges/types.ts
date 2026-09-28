/**
 * Exchange provider abstraction (spec §42). Read-only by design: providers expose permission
 * inspection and balances — never order placement, transfers or withdrawals.
 */
export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface PermissionCheck {
  ok: boolean;
  /** Reasons the key was rejected (empty when ok) */
  reasons: string[];
  /** Normalised permission flags as reported by the provider */
  permissions: Record<string, boolean>;
  ipRestricted: boolean | null;
}

export interface ExchangeAssetBalance {
  asset: string;
  free: string;
  locked: string;
}

export interface ExchangeProvider {
  id: string;
  name: string;
  /** Inspect key permissions; reject anything that is not read-only. */
  checkReadOnly(creds: ExchangeCredentials): Promise<PermissionCheck>;
  getBalances(creds: ExchangeCredentials): Promise<ExchangeAssetBalance[]>;
}

export class ExchangeApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public providerCode?: number | string,
  ) {
    super(message);
  }
}
