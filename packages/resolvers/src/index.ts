/**
 * @satspath/resolvers — TypeScript resolver chain for SatsPath
 * 
 * Usage:
 * ```typescript
 * import { createDefaultChain, resolveAlias } from "@satspath/resolvers";
 * 
 * const profile = await resolveAlias("alice@example.com");
 * ```
 */

// Types
export type { 
  BitcoinNetwork,
  TypedPaymentMethod,
  OnchainMethod,
  LightningMethod,
  ArkMethod,
  PaymentProfile,
  SignedPaymentProfile,
  KeyRotation,
  MethodVerification,
  ProfileResolver,
  Invite,
  InviteRecord,
} from "./types";

export { 
  identifierHash, 
  maskIdentifier,
  AliasNotFoundError,
  SatsPathError,
  InvalidSignatureError,
  ProfileExpiredError,
} from "./types";

// Resolvers
export { LocalRegistryResolver, type LocalRegistryOptions, getDefaultRegistry, setDefaultRegistry } from "./localRegistry";
export { Bip353Resolver, type Bip353Resolution, type DnssecPolicy } from "./bip353";
export { HttpWellKnownResolver, type WellKnownProfile } from "./httpWellKnown";
export { NostrNip05Resolver } from "./nostrNip05";

// Chain
export { createDefaultChain, createCustomChain, ChainResolver } from "./chainResolver";

// Quick resolve
export { resolveAlias, verifyProfile, getDefaultChain } from "./quickResolve";