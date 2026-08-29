/**
 * @satspath/router — Payment rail router for SatsPath
 * 
 * Usage:
 * ```typescript
 * import { quote, quoteWithResolver, buildQrPayload, selectRouteLive } from "@satspath/router";
 * 
 * // High-level: resolve + verify + route + QR
 * const response = await quote("alice@example.com", 21000);
 * 
 * // Low-level: custom resolver chain
 * const resolver = new ChainResolver()
 *   .push(new LocalRegistryResolver())
 *   .push(new Bip353Resolver());
 * const response = await quoteWithResolver(resolver, "bob@domain.com", 50000);
 * ```
 */

// Types
export type { 
  FeeEstimate,
  RouteRequest,
  RouteQuote,
  FeeRateSnapshot,
  SwapDirective,
  ExecutionMode,
  QuoteRecipient,
  QuoteResponse,
  Invite,
  ArkRoutePlan,
  SenderCapabilities,
} from "./types";

export type { TypedPaymentMethod } from "@satspath/resolvers";

// Core functions
export { quote, quoteWithResolver, createInvite } from "./quote";
export { selectRoute, selectRouteLive, type PaymentUrgency } from "./router";
export { fetchFeeEstimate, FALLBACK_FEES } from "./fees";
export { planArkRoute } from "./rails";
export { buildQrPayload, satsToBtc, estimateOnchainFee, estimateLightningFee } from "./qr";

// Re-export resolver types for convenience
export { 
  ChainResolver, 
  AliasNotFoundError 
} from "@satspath/resolvers";
export type { 
  ProfileResolver, 
  SignedPaymentProfile
} from "@satspath/resolvers";

// Constants
export { LIGHTNING_THRESHOLD_SATS, MAX_ONCHAIN_FEE_SAT_VB, ONCHAIN_FEE_BUFFER } from "./types";