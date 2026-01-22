export enum LedgerAccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

export enum LedgerDirection {
  DEBIT = -1,
  CREDIT = 1,
}

export enum LedgerEventType {
  TRADE_FILL = 'TRADE_FILL',
  FUNDING_PAYMENT = 'FUNDING_PAYMENT',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  ADJUSTMENT = 'ADJUSTMENT',
  REALIZED_PNL = 'REALIZED_PNL',
}

export interface LedgerAccount {
  id: string;
  name: string;
  type: LedgerAccountType;
  currency: string;
  metadata?: Record<string, any>;
  created_at: Date;
}

export interface LedgerTransaction {
  id: string;
  correlation_id: string;
  event_type: LedgerEventType;
  description?: string;
  posted_at: Date;
  metadata?: Record<string, any>;
  entries?: LedgerEntry[]; // Hydrated
}

export interface LedgerEntry {
  id: string;
  tx_id: string;
  account_id: string;
  direction: LedgerDirection;
  amount: number; // Decimal in DB, number in JS for now (be careful with precision)
  created_at: Date;
}

export interface CreateLedgerEntryDTO {
  account_name: string; // Resolves to ID internally
  currency: string; // Resolves to ID internally
  direction: LedgerDirection;
  amount: number;
}

export interface CreateLedgerTransactionDTO {
  correlation_id: string;
  event_type: LedgerEventType;
  description?: string;
  entries: CreateLedgerEntryDTO[];
  metadata?: Record<string, any>;
}
