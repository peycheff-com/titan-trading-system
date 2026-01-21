/**
 * Event Log Schema for Event Sourcing & Replay
 * Defines the sequence of events from Intent to Reconciliation
 */

export enum EventType {
  INTENT_CREATED = 'INTENT_CREATED',
  INTENT_VALIDATED = 'INTENT_VALIDATED',
  INTENT_REJECTED = 'INTENT_REJECTED',
  ORDER_SENT = 'ORDER_SENT',
  ORDER_ACKNOWLEDGED = 'ORDER_ACKNOWLEDGED',
  ORDER_FILLED = 'ORDER_FILLED',
  ORDER_REJECTED = 'ORDER_REJECTED',
  RECONCILIATION_COMPLETED = 'RECONCILIATION_COMPLETED',
}

export interface BaseEvent {
  eventId: string;
  traceId: string; // Correlates all events for a single signal/order
  timestamp: number;
  type: EventType;
  metadata?: Record<string, any>;
}

export interface IntentCreatedEvent extends BaseEvent {
  type: EventType.INTENT_CREATED;
  payload: {
    signalId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    size: number;
    exchange?: string;
    description?: string;
  };
}

export interface IntentValidatedEvent extends BaseEvent {
  type: EventType.INTENT_VALIDATED;
  payload: {
    signalId: string;
    checkResults: {
      risk: boolean;
      cost: boolean;
      compliance: boolean;
    };
    authorizedSize: number;
  };
}

export interface OrderSentEvent extends BaseEvent {
  type: EventType.ORDER_SENT;
  payload: {
    signalId: string;
    orderRequest: any; // Mapped order request
    exchange: string;
  };
}

export interface OrderFilledEvent extends BaseEvent {
  type: EventType.ORDER_FILLED;
  payload: {
    signalId: string;
    orderId: string;
    symbol: string;
    fillPrice: number;
    fillSize: number;
    fee: number;
    feeCurrency: string;
  };
}

/**
 * Union type for all possible events
 */
export type TitanEvent =
  | IntentCreatedEvent
  | IntentValidatedEvent
  | OrderSentEvent
  | OrderFilledEvent;

/**
 * Event Store Interface
 */
export interface EventStore {
  append(event: TitanEvent): Promise<void>;
  getStream(traceId: string): Promise<TitanEvent[]>;
  replayAll(since: number): Promise<TitanEvent[]>;
}
