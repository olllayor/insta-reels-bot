import { log } from '../logger/index.js';
import { withTelegramNetworkRetry as withRetry } from '../utils/network.js';

export const withTelegramNetworkRetry = withRetry;