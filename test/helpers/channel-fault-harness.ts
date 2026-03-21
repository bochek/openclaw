export type ChannelOutboundFault =
  | {
      kind: "rate_limit";
      attempts?: number;
      message?: string;
      surface?: string;
    }
  | {
      kind: "timeout";
      attempts?: number;
      message?: string;
      surface?: string;
    }
  | {
      kind: "error";
      attempts?: number;
      message?: string;
      surface?: string;
    };

export type ChannelHarnessEvent = {
  kind: string;
  payload?: unknown;
};

export type ChannelHarnessOutboundCall = {
  kind: string;
  target?: string;
  body?: string;
  meta?: Record<string, unknown>;
};

export type ChannelHarnessIdleExpectation = {
  minEmittedEvents?: number;
  minOutboundCalls?: number;
};

export type ChannelFaultHarness<TEvent, TStableState> = {
  inject: (event: TEvent) => Promise<void>;
  injectSequence: (events: readonly TEvent[]) => Promise<void>;
  setOutboundFault: (fault: ChannelOutboundFault | null) => void;
  getOutboundCalls: () => ChannelHarnessOutboundCall[];
  getEmittedEvents: () => ChannelHarnessEvent[];
  getStableState: () => TStableState;
  waitForIdle: (expectation?: ChannelHarnessIdleExpectation) => Promise<void>;
};
