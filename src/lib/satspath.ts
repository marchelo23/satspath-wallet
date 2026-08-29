import {
  resolveAlias,
  SignedPaymentProfile,
  PaymentProfile,
  TypedPaymentMethod,
  ArkMethod,
  LightningMethod,
  OnchainMethod,
} from '@satspath/resolvers'
import {
  selectRoute,
  estimateLightningFee,
  estimateOnchainFee,
  fetchFeeEstimate,
  FALLBACK_FEES,
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
    const clean = identifier.trim().replace(/^₿/, '')
    const profile = await resolveAlias(clean)
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

/**
 * Returns a deterministic, sorted-key JSON string for canonical hashing.
 * Keys are sorted recursively so property insertion order (which varies
 * across JS engines and serializers) does not affect the digest. This
 * matches what an external Rust serde_json signer can reproduce by using
 * serde's `BTreeMap`-backed serialization or an equivalent sorted emitter.
 */
function canonicalProfileJson(profile: PaymentProfile): string {
  // Recursively sort object keys; arrays preserve element order.
  function sortedJson(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortedJson)
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.keys(value as Record<string, unknown>)
          .sort()
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
  amountSats?: number
  label?: string
  message?: string
}): string {
  const base = options.onchainAddress || options.arkAddress || ''
  if (!base) return ''

  const params = new URLSearchParams()
  if (options.amountSats) {
    params.set('amount', (options.amountSats / 100_000_000).toFixed(8))
  }
  if (options.arkAddress && options.arkAddress !== base) {
    params.set('ark', options.arkAddress)
  }
  if (options.lightningInvoice) {
    params.set('lightning', options.lightningInvoice.toUpperCase())
  }
  if (options.label) {
    params.set('label', options.label)
  }
  if (options.message) {
    params.set('message', options.message)
  }

  const query = params.toString()
  return query ? `bitcoin:${base}?${query}` : `bitcoin:${base}`
}
