import {
  resolveAlias,
  SignedPaymentProfile,
  PaymentProfile,
  TypedPaymentMethod,
  ArkMethod,
  LightningMethod,
  OnchainMethod,
  BitcoinNetwork,
} from '@satspath/resolvers'
import {
  selectRoute,
  estimateLightningFee,
  estimateOnchainFee,
  fetchFeeEstimate,
  FALLBACK_FEES,
  buildQrPayload,
  type FeeEstimate,
  type PaymentUrgency,
} from '@satspath/router'
import { schnorr } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { consoleError } from './logs'

export interface SatsPathRailQuote {
  rail: 'Ark' | 'Lightning' | 'Onchain'
  available: boolean
  estimatedFeeSats: number
  estimatedConfirmation: string
  reason: string
  destination: string
  isRecommended: boolean
  savingsSats?: number
}

export interface SatsPathMultiRailAnalysis {
  recipient: string
  profile?: SignedPaymentProfile
  isVerifiedProfile: boolean
  recommendedRail: 'Ark' | 'Lightning' | 'Onchain'
  recommendedReason: string
  selectedUrgency: PaymentUrgency
  quotes: {
    ark?: SatsPathRailQuote
    lightning?: SatsPathRailQuote
    onchain?: SatsPathRailQuote
  }
}

/**
 * Checks if input is potentially a human-readable SatsPath identifier,
 * BIP-353 address, Nostr NIP-05, or Lightning address (e.g. user@domain.com or ₿user@domain.com)
 */
export function isSatsPathIdentifier(input: string): boolean {
  if (!input) return false
  const clean = input.trim().replace(/^₿/, '')
  const emailLike = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  return emailLike.test(clean)
}

/**
 * Resolves an identifier using the SatsPath resolver chain
 */
export async function resolveSatsPathProfile(identifier: string): Promise<SignedPaymentProfile | null> {
  try {
    const clean = identifier.trim().replace(/^₿/, '').toLowerCase()
    const profile = await resolveAlias(clean)
    if (profile && profile.profile && profile.profile.alias) {
      const profileAlias = profile.profile.alias.trim().replace(/^₿/, '').toLowerCase()
      if (profileAlias !== clean) {
        consoleError(null, `SatsPath alias mismatch: expected ${clean}, got ${profileAlias}`)
        return null
      }
    }
    return profile
  } catch (err) {
    consoleError(err, 'SatsPath alias resolution not found or failed')
    return null
  }
}

let cachedFees: { fees: FeeEstimate; timestamp: number } | null = null
const CACHE_TTL_MS = 60_000

export async function getFeeEstimate(forceRefresh = false): Promise<FeeEstimate> {
  const now = Date.now()
  if (!forceRefresh && cachedFees && now - cachedFees.timestamp < CACHE_TTL_MS) {
    return cachedFees.fees
  }
  try {
    const fees = await fetchFeeEstimate()
    cachedFees = { fees, timestamp: now }
    return fees
  } catch {
    return cachedFees?.fees || FALLBACK_FEES
  }
}

const utf8Encoder = new TextEncoder()
function utf8Compare(a: string, b: string): number {
  const bufA = utf8Encoder.encode(a)
  const bufB = utf8Encoder.encode(b)
  const minLen = Math.min(bufA.length, bufB.length)
  for (let i = 0; i < minLen; i++) {
    if (bufA[i] !== bufB[i]) return bufA[i] - bufB[i]
  }
  return bufA.length - bufB.length
}

/**
 * Returns a deterministic, sorted-key JSON string for canonical hashing.
 * Keys are sorted recursively by UTF-8 byte ordering so property insertion order
 * (which varies across JS engines and serializers) does not affect the digest. This
 * matches what an external Rust serde_json signer can reproduce by using
 * serde's `BTreeMap`-backed serialization or an equivalent sorted emitter.
 */
function canonicalProfileJson(profile: PaymentProfile): string {
  // Recursively sort object keys by UTF-8 byte representation; arrays preserve element order.
  function sortedJson(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortedJson)
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.keys(value as Record<string, unknown>)
          .sort(utf8Compare)
          .map((k) => [k, sortedJson((value as Record<string, unknown>)[k])]),
      )
    }
    return value
  }
  return JSON.stringify(sortedJson(profile))
}

/**
 * Cryptographically verifies a SatsPath profile's Schnorr signature against its identity_pubkey.
 *
 * Message: SHA-256( UTF-8( canonicalProfileJson(profile) ) )
 * where canonicalProfileJson serializes the profile with recursively sorted
 * object keys — matching Rust serde_json's BTreeMap order — so both sides
 * always hash the same bytes regardless of field insertion order.
 *
 * Only 32-byte x-only (64 hex chars) or 02-prefixed (66 hex chars) pubkeys
 * are accepted. 03-prefixed keys are rejected: stripping the prefix would
 * silently use the wrong parity and break external signers that distinguish
 * even/odd-Y keys.
 *
 * Profiles whose expires_at is in the past are rejected even if the
 * signature is otherwise valid.
 */
export function verifySatsPathProfileSignature(signedProfile: SignedPaymentProfile): boolean {
  try {
    if (!signedProfile || !signedProfile.signature || !signedProfile.profile?.identity_pubkey) {
      return false
    }
    const sigHex = signedProfile.signature.trim()
    if (sigHex.length !== 128) {
      return false
    }

    // Reject profiles that have explicitly expired.
    const { expires_at } = signedProfile.profile
    if (expires_at !== undefined && expires_at < Math.floor(Date.now() / 1000)) {
      return false
    }

    let pubkeyHex = signedProfile.profile.identity_pubkey.trim()
    // Only strip even-Y (02) prefix to obtain the BIP-340 x-only key.
    // A 03-prefix denotes odd-Y parity and must NOT be silently discarded
    // because that would cause the wrong key to be used for verification.
    if (pubkeyHex.length === 66) {
      if (pubkeyHex.startsWith('02')) {
        pubkeyHex = pubkeyHex.slice(2)
      } else {
        // 03-prefix (odd-Y) or unknown prefix: reject rather than strip.
        return false
      }
    }
    if (pubkeyHex.length !== 64) {
      return false
    }

    const messageBytes = new TextEncoder().encode(canonicalProfileJson(signedProfile.profile))
    const messageHash = sha256(messageBytes)
    return schnorr.verify(hexToBytes(sigHex), messageHash, hexToBytes(pubkeyHex))
  } catch {
    return false
  }
}

/**
 * Signs a payment profile with a 32-byte secp256k1 private key, producing a SignedPaymentProfile.
 * Uses canonicalProfileJson so the signed bytes match those used by verifySatsPathProfileSignature.
 */
export function signSatsPathProfile(profile: PaymentProfile, privateKey: Uint8Array): SignedPaymentProfile {
  const messageBytes = new TextEncoder().encode(canonicalProfileJson(profile))
  const messageHash = sha256(messageBytes)
  const signature = bytesToHex(schnorr.sign(messageHash, privateKey))
  return {
    profile,
    signature,
  }
}

/**
 * Generates an exhaustive multi-rail routing comparison for a given profile and amount
 */
export async function analyzeSatsPathRoutes(
  profileOrMethods: SignedPaymentProfile | TypedPaymentMethod[],
  amountSats: number,
  urgency: PaymentUrgency = 'normal',
  recipientAlias = 'Recipient',
  customFees?: FeeEstimate,
): Promise<SatsPathMultiRailAnalysis> {
  const isSigned = !Array.isArray(profileOrMethods)
  const methods = isSigned ? profileOrMethods.profile.methods : profileOrMethods
  const isVerifiedProfile = isSigned ? verifySatsPathProfileSignature(profileOrMethods) : false

  const signedProfile: SignedPaymentProfile = isSigned
    ? profileOrMethods
    : {
        profile: {
          alias: recipientAlias,
          identity_pubkey: '020000000000000000000000000000000000000000000000000000000000000001',
          methods,
          updated_at: Math.floor(Date.now() / 1000),
          preferences: [],
          method_verifications: [],
        },
        signature: '0'.repeat(128),
      }

  let feeEstimate = customFees || FALLBACK_FEES
  if (!customFees) {
    try {
      feeEstimate = await getFeeEstimate()
    } catch {
      feeEstimate = FALLBACK_FEES
    }
  }

  // Calculate live route with router
  let primaryQuote
  try {
    primaryQuote = selectRoute(
      {
        alias: recipientAlias,
        amount_sats: amountSats,
        signed_profile: signedProfile,
        urgency,
      },
      feeEstimate,
    )
  } catch {
    // Handled in quote aggregation
  }

  const arkMethod = methods.find((m) => m.type === 'Ark') as ArkMethod | undefined
  const lnMethod = methods.find((m) => m.type === 'Lightning') as LightningMethod | undefined
  const onchainMethod = methods.find((m) => m.type === 'Onchain') as OnchainMethod | undefined

  const selectedFeeRate =
    urgency === 'high'
      ? feeEstimate.fastest_fee
      : urgency === 'normal'
        ? feeEstimate.half_hour_fee
        : feeEstimate.hour_fee

  const onchainFeeSats = estimateOnchainFee(selectedFeeRate)
  const lightningFeeSats = estimateLightningFee(amountSats)
  const arkFeeSats = 0 // Ark offchain VTXO transfers have 0 or absorbed fee

  const quotes: SatsPathMultiRailAnalysis['quotes'] = {}

  // 1. Ark Rail Quote
  if (arkMethod) {
    quotes.ark = {
      rail: 'Ark',
      available: true,
      estimatedFeeSats: arkFeeSats,
      estimatedConfirmation: 'Instant (<1s)',
      reason: 'Off-chain VTXO transfer with zero network fees.',
      destination: arkMethod.pubkey || arkMethod.server,
      isRecommended: primaryQuote?.selected_method?.type === 'Ark',
      savingsSats: Math.max(0, onchainFeeSats - arkFeeSats),
    }
  }

  // 2. Lightning Rail Quote
  if (lnMethod) {
    quotes.lightning = {
      rail: 'Lightning',
      available: true,
      estimatedFeeSats: lightningFeeSats,
      estimatedConfirmation: 'Instant (<2s)',
      reason: 'Off-chain Lightning payment via RFQ Solver.',
      destination: lnMethod.lightning_address || lnMethod.lnurl || '',
      isRecommended: primaryQuote?.selected_method?.type === 'Lightning',
      savingsSats: Math.max(0, onchainFeeSats - lightningFeeSats),
    }
  }

  // 3. On-chain Rail Quote
  if (onchainMethod) {
    const isCheap = selectedFeeRate <= 10
    quotes.onchain = {
      rail: 'Onchain',
      available: true,
      estimatedFeeSats: onchainFeeSats,
      estimatedConfirmation: urgency === 'high' ? '~10 min' : urgency === 'normal' ? '~30 min' : '~60 min',
      reason: isCheap
        ? `L1 mempool fee is low (${selectedFeeRate} sat/vB). Direct on-chain settlement.`
        : `L1 fee is elevated (${selectedFeeRate} sat/vB). Off-chain rails recommended.`,
      destination: onchainMethod.address || '',
      isRecommended: primaryQuote?.selected_method?.type === 'Onchain',
    }
  }

  const recommendedType =
    primaryQuote?.selected_method?.type || (arkMethod ? 'Ark' : lnMethod ? 'Lightning' : 'Onchain')

  return {
    recipient: recipientAlias,
    profile: isSigned ? profileOrMethods : undefined,
    isVerifiedProfile,
    recommendedRail: recommendedType as 'Ark' | 'Lightning' | 'Onchain',
    recommendedReason: primaryQuote?.reason || 'Optimal rail selected based on amount and network fees.',
    selectedUrgency: urgency,
    quotes,
  }
}

/**
 * Builds a unified BIP-21 URI with multi-rail SatsPath parameters
 */
export function buildSatsPathUnifiedUri(options: {
  onchainAddress?: string
  arkAddress?: string
  lightningInvoice?: string
  lightningAddress?: string
  lightningLnurl?: string
  amountSats?: number
  label?: string
  message?: string
  satspathProfile?: string
}): string {
  const base = options.onchainAddress || options.arkAddress || ''
  if (!base) return ''

  const params = new URLSearchParams()

  if (options.amountSats) {
    params.set('amount', (options.amountSats / 100_000_000).toFixed(8))
  }

  // Ark is the preferred zero-fee, instant rail. It is only added as a
  // separate parameter when the base address is the on-chain fallback, so a
  // SatsPath-aware wallet can prioritise it without breaking traditional ones.
  if (options.arkAddress && options.arkAddress !== base) {
    params.set('ark', options.arkAddress)
  }

  // Lightning parameter is produced through buildQrPayload so the encoded value
  // matches the canonical Lightning URI form (LNURL > Lightning Address > BOLT12).
  if (options.lightningInvoice || options.lightningAddress || options.lightningLnurl) {
    const lightning = buildQrPayload(
      {
        type: 'Lightning',
        label: 'Lightning',
        lightning_address: options.lightningAddress,
        lnurl: options.lightningLnurl,
        bolt12: options.lightningInvoice,
      },
      options.amountSats ?? 0,
    )
    if (lightning) {
      params.set('lightning', lightning.toUpperCase())
    }
  }

  if (options.label) {
    params.set('label', options.label)
  }
  if (options.message) {
    params.set('message', options.message)
  }

  // Self-contained, signed PaymentProfile so any SatsPath-compatible scanner can
  // verify the recipient identity and present all rails without a second lookup.
  if (options.satspathProfile) {
    params.set('satspath_profile', options.satspathProfile)
  }

  const query = params.toString()
  return query ? `bitcoin:${base}?${query}` : `bitcoin:${base}`
}

/**
 * URL-encodes a signed profile for embedding in the `satspath_profile=` BIP-21
 * parameter. Kept separate so callers can also persist/share the raw JSON.
 */
export function encodeSignedProfileForUri(profile: SignedPaymentProfile): string {
  return encodeURIComponent(JSON.stringify(profile))
}

/**
 * Default TTL for a freshly signed own profile. Dynamic receive profiles are
 * short-lived so a leaked/rotated on-chain address cannot be reused indefinitely.
 */
export const DEFAULT_PROFILE_TTL_SECONDS = 24 * 60 * 60

/**
 * Inputs required to build the wallet's own PaymentProfile.
 *
 * The identity public key is derived from `privateKey` (BIP-340 x-only), keeping
 * the signing key and the advertised identity in lock-step. Lightning fields are
 * optional: many wallets only expose a dynamic invoice, not a static address, so
 * a profile is still valid with just Ark + On-chain rails.
 */
export interface OwnPaymentProfileInput {
  alias: string
  privateKey: Uint8Array
  arkAddress: string
  arkServer?: string
  onchainAddress: string
  lightningAddress?: string
  lightningLnurl?: string
  lightningInvoice?: string
  ttlSeconds?: number
  network?: BitcoinNetwork
  label?: string
}

/**
 * Builds the wallet's own PaymentProfile without signing it.
 */
export function createOwnPaymentProfile(input: OwnPaymentProfileInput): PaymentProfile {
  const now = Math.floor(Date.now() / 1000)
  const identityPubkey = bytesToHex(schnorr.getPublicKey(input.privateKey))

  const methods: TypedPaymentMethod[] = []

  if (input.arkAddress) {
    const ark: ArkMethod = {
      type: 'Ark',
      label: input.label || 'Arkade (VTXO)',
      server: input.arkServer || '',
      pubkey: input.arkAddress,
    }
    if (input.lightningInvoice) {
      // Reuse the short-lived invoice as a proof of ownership hint where present.
      ark.opaque_uri = input.lightningInvoice
    }
    methods.push(ark)
  }

  if (input.lightningAddress || input.lightningLnurl || input.lightningInvoice) {
    methods.push({
      type: 'Lightning',
      label: 'Lightning',
      lightning_address: input.lightningAddress,
      lnurl: input.lightningLnurl,
      bolt12: input.lightningInvoice,
    })
  }

  if (input.onchainAddress) {
    methods.push({
      type: 'Onchain',
      label: 'Bitcoin On-chain',
      network: input.network ?? 'mainnet',
      address: input.onchainAddress,
      address_list: [input.onchainAddress],
    })
  }

  return {
    alias: input.alias,
    identity_pubkey: identityPubkey,
    methods,
    updated_at: now,
    expires_at: now + (input.ttlSeconds ?? DEFAULT_PROFILE_TTL_SECONDS),
    preferences: [],
    method_verifications: [],
  }
}

/**
 * Builds and Schnorr-signs the wallet's own PaymentProfile using its identity key.
 * The resulting SignedPaymentProfile can be embedded in a unified receive QR
 * (satspath_profile=) or shared as a standalone claimable identity.
 */
export function createSignedProfileFromWallet(input: OwnPaymentProfileInput): SignedPaymentProfile {
  const profile = createOwnPaymentProfile(input)
  return signSatsPathProfile(profile, input.privateKey)
}

const SATSPATH_IDENTITY_KEY = 'satspath:identity:v1'

export interface SatsPathIdentitySettings {
  alias: string
  lightningAddress?: string
  lightningLnurl?: string
}

export function loadSatsPathIdentitySettings(): SatsPathIdentitySettings {
  try {
    const raw = localStorage.getItem(SATSPATH_IDENTITY_KEY)
    if (!raw) return { alias: '' }
    const parsed = JSON.parse(raw) as Partial<SatsPathIdentitySettings>
    return {
      alias: typeof parsed.alias === 'string' ? parsed.alias : '',
      lightningAddress: typeof parsed.lightningAddress === 'string' ? parsed.lightningAddress : undefined,
      lightningLnurl: typeof parsed.lightningLnurl === 'string' ? parsed.lightningLnurl : undefined,
    }
  } catch {
    return { alias: '' }
  }
}

export function saveSatsPathIdentitySettings(settings: SatsPathIdentitySettings): void {
  try {
    localStorage.setItem(SATSPATH_IDENTITY_KEY, JSON.stringify(settings))
  } catch {
    // storage unavailable — non-fatal for in-memory alias configuration
  }
}
