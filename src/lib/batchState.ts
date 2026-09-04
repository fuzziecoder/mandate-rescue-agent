/**
 * Shared in-memory batch state.
 * Lives in a separate module (not a route file) so Next.js doesn't try to
 * treat `batchState` as an HTTP export — route files may only export HTTP
 * verb functions (GET, POST, …) and a handful of Next.js config keys.
 */

export interface BatchState {
  isRunning: boolean;
  processed: number;
  total: number;
  currentStage: 'idle' | 'classify' | 'decide' | 'guardrails' | 'execute';
  currentTxIndex: number;
  metrics: {
    recovered: number;
    failed: number;
    stopped: number;
    nudgesBlocked: number;
  };
}

export const batchState: BatchState = {
  isRunning: false,
  processed: 0,
  total: 0,
  currentStage: 'idle',
  currentTxIndex: 0,
  metrics: { recovered: 0, failed: 0, stopped: 0, nudgesBlocked: 0 }
};
