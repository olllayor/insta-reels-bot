export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
	failureThreshold: number;
	openDurationMs: number;
	halfOpenMaxProbes: number;
	name: string;
}

export class CircuitOpenError extends Error {
	readonly name = 'CircuitOpenError';
	readonly breakerName: string;
	readonly retryAfterMs: number;
	constructor(breakerName: string, retryAfterMs: number) {
		super(`Circuit breaker "${breakerName}" is OPEN (retry in ${Math.round(retryAfterMs / 1000)}s)`);
		this.breakerName = breakerName;
		this.retryAfterMs = retryAfterMs;
	}
}

const DEFAULTS = {
	failureThreshold: 5,
	openDurationMs: 30_000,
	halfOpenMaxProbes: 1,
};

export class CircuitBreaker {
	readonly name: string;
	readonly failureThreshold: number;
	readonly openDurationMs: number;
	readonly halfOpenMaxProbes: number;

	private state: CircuitState = 'CLOSED';
	private consecutiveFailures = 0;
	private openedAt = 0;
	private halfOpenInFlight = 0;
	private totalTrips = 0;
	private lastTripAt = 0;
	private stateListeners: Array<(state: CircuitState) => void> = [];

	constructor(config: Partial<CircuitBreakerConfig> & { name: string }) {
		this.name = config.name;
		this.failureThreshold = config.failureThreshold ?? DEFAULTS.failureThreshold;
		this.openDurationMs = config.openDurationMs ?? DEFAULTS.openDurationMs;
		this.halfOpenMaxProbes = config.halfOpenMaxProbes ?? DEFAULTS.halfOpenMaxProbes;
	}

	getState(): CircuitState {
		if (this.state === 'OPEN' && Date.now() - this.openedAt >= this.openDurationMs) {
			this.transition('HALF_OPEN');
		}
		return this.state;
	}

	getStats() {
		return {
			name: this.name,
			state: this.getState(),
			consecutiveFailures: this.consecutiveFailures,
			openedAt: this.openedAt,
			totalTrips: this.totalTrips,
			lastTripAt: this.lastTripAt,
		};
	}

	onStateChange(listener: (state: CircuitState) => void): () => void {
		this.stateListeners.push(listener);
		return () => {
			this.stateListeners = this.stateListeners.filter((l) => l !== listener);
		};
	}

	async execute<T>(fn: () => Promise<T>): Promise<T> {
		const current = this.getState();

		if (current === 'OPEN') {
			const retryAfterMs = Math.max(0, this.openDurationMs - (Date.now() - this.openedAt));
			throw new CircuitOpenError(this.name, retryAfterMs);
		}

		if (current === 'HALF_OPEN') {
			if (this.halfOpenInFlight >= this.halfOpenMaxProbes) {
				const retryAfterMs = Math.max(0, this.openDurationMs - (Date.now() - this.openedAt));
				throw new CircuitOpenError(this.name, retryAfterMs);
			}
			this.halfOpenInFlight++;
		}

		try {
			const result = await fn();
			this.onSuccess();
			return result;
		} catch (err) {
			this.onFailure();
			throw err;
		}
	}

	private onSuccess() {
		if (this.state === 'HALF_OPEN') {
			this.halfOpenInFlight = Math.max(0, this.halfOpenInFlight - 1);
			this.consecutiveFailures = 0;
			this.transition('CLOSED');
		} else {
			this.consecutiveFailures = 0;
		}
	}

	private onFailure() {
		if (this.state === 'HALF_OPEN') {
			this.halfOpenInFlight = Math.max(0, this.halfOpenInFlight - 1);
			this.trip();
			return;
		}
		this.consecutiveFailures++;
		if (this.consecutiveFailures >= this.failureThreshold) {
			this.trip();
		}
	}

	private trip() {
		const wasClosedOrHalf = this.state !== 'OPEN';
		this.state = 'OPEN';
		this.openedAt = Date.now();
		this.halfOpenInFlight = 0;
		if (wasClosedOrHalf) {
			this.totalTrips++;
			this.lastTripAt = this.openedAt;
			this.notify('OPEN');
		}
	}

	private transition(next: CircuitState) {
		if (this.state === next) return;
		this.state = next;
		if (next === 'HALF_OPEN') {
			this.consecutiveFailures = 0;
			this.halfOpenInFlight = 0;
		}
		this.notify(next);
	}

	private notify(state: CircuitState) {
		for (const listener of this.stateListeners) {
			try {
				listener(state);
			} catch {
				// ignore listener errors
			}
		}
	}
}

let cobaltBreakerSingleton: CircuitBreaker | null = null;

export const getCobaltCircuitBreaker = (): CircuitBreaker => {
	if (!cobaltBreakerSingleton) {
		cobaltBreakerSingleton = new CircuitBreaker({
			name: 'cobalt-api',
			failureThreshold: Math.max(1, Number(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || 5)),
			openDurationMs: Math.max(1_000, Number(process.env.CIRCUIT_BREAKER_OPEN_DURATION_MS || 30_000)),
			halfOpenMaxProbes: 1,
		});
	}
	return cobaltBreakerSingleton;
};
