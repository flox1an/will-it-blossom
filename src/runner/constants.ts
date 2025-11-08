/**
 * Configuration constants for the test runner.
 * Centralizes timeout values, limits, and other magic numbers.
 */

/**
 * Timeout values in milliseconds
 */
export const TIMEOUTS = {
  /** Timeout for health check HTTP probes */
  HEALTH_CHECK_DEFAULT: 20_000,
  /** Individual HTTP request timeout during health check */
  HEALTH_CHECK_REQUEST: 2_000,
  /** Interval between health check retries */
  HEALTH_CHECK_RETRY: 250,
  /** Timeout for graceful Docker container stop */
  DOCKER_STOP: 15_000,
  /** Timeout for forceful Docker container removal */
  DOCKER_FORCE_REMOVE: 10_000,
  /** Wait time after SIGTERM before SIGKILL */
  PROCESS_SIGTERM_WAIT: 5_000,
  /** Wait time after sending SIGTERM to child process */
  PROCESS_INITIAL_WAIT: 200,
} as const;

/**
 * Authorization and authentication constants
 */
export const AUTH = {
  /** Default expiration time for NIP-98 authorization events (seconds) */
  DEFAULT_EXPIRATION_SECONDS: 600,
} as const;

/**
 * Test execution constants
 */
export const TEST = {
  /** Default timeout for individual tests (milliseconds) */
  DEFAULT_TEST_TIMEOUT: 30_000,
  /** Default timeout for test hooks (milliseconds) */
  DEFAULT_HOOK_TIMEOUT: 60_000,
} as const;

/**
 * Logging and output constants
 */
export const LOGGING = {
  /** Maximum log entries to keep in memory per process */
  MAX_LOG_ENTRIES: 1000,
  /** Visual separator length for console output */
  SEPARATOR_LENGTH: 60,
} as const;
