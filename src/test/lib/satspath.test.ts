import createFetchMock from 'vitest-fetch-mock'
import { describe, expect, it, vi } from 'vitest'
import * as resolvers from '@satspath/resolvers'
import type { SignedPaymentProfile, PaymentProfile } from '@satspath/resolvers'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex } from '@noble/hashes/utils.js'

const fetchMocker = createFetchMock(vi)
fetchMocker.enableMocks()
import {
  isSatsPathIdentifier,
  resolveSatsPathProfile,
  getFeeEstimate,
  analyzeSatsPathRoutes,
  buildSatsPathUnifiedUri,
  verifySatsPathProfileSignature,
  signSatsPathProfile,
} from '../../lib/satspath'

describe('SatsPath Multi-Rail Lib', () => {
  describe('isSatsPathIdentifier', () => {
    it('identifies valid email-like / BIP-353 identifiers', () => {
      expect(isSatsPathIdentifier('alice@satspath.com')).toBe(true)
      expect(isSatsPathIdentifier('bob.smith@domain.co.uk')).toBe(true)
      expect(isSatsPathIdentifier('user+tag@example.org')).toBe(true)
      expect(isSatsPathIdentifier('₿alice@domain.com')).toBe(true)
    })

    it('rejects invalid or empty identifiers', () => {
      expect(isSatsPathIdentifier('')).toBe(false)
      expect(isSatsPathIdentifier('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe(false)
      expect(isSatsPathIdentifier('not-an-email')).toBe(false)
      expect(isSatsPathIdentifier('@domain.com')).toBe(false)
      expect(isSatsPathIdentifier('alice@')).toBe(false)
    })
  })

  describe('resolveSatsPathProfile', () => {
    it('mocks resolveAlias rejection and handles catch-path gracefully', async () => {
      const resolveSpy = vi.spyOn(resolvers, 'resolveAlias').mockRejectedValueOnce(new Error('Resolver lookup failed'))

      const profile = await resolveSatsPathProfile('nonexistent-user-12345@unknown-domain-xyz.local')
      expect(profile).toBeNull()
      expect(resolveSpy).toHaveBeenCalledWith('nonexistent-user-12345@unknown-domain-xyz.local')
      resolveSpy.mockRestore()
    })

    it('returns resolved profile when resolver succeeds', async () => {
      const mockSignedProfile: SignedPaymentProfile = {
        profile: {
          alias: 'alice@domain.com',
          identity_pubkey: '020000000000000000000000000000000000000000000000000000000000000001',
          methods: [],
          updated_at: 1700000000,
          preferences: [],
          method_verifications: [],
        },
        signature: '0'.repeat(128),
      }
      const resolveSpy = vi.spyOn(resolvers, 'resolveAlias').mockResolvedValueOnce(mockSignedProfile)

      const profile = await resolveSatsPathProfile('alice@domain.com')
      expect(profile).toEqual(mockSignedProfile)
      expect(resolveSpy).toHaveBeenCalledWith('alice@domain.com')
      resolveSpy.mockRestore()
    })
  })

  describe('verifySatsPathProfileSignature and signSatsPathProfile', () => {
    const testPrivKey = new Uint8Array(32).fill(9)
    const testPubKeyHex = bytesToHex(schnorr.getPublicKey(testPrivKey))

    const baseProfile: PaymentProfile = {
      alias: 'alice@satspath.com',
      identity_pubkey: testPubKeyHex,
      methods: [
        {
          type: 'Ark',
          label: 'Ark',
          server: 'https://ark.satspath.com',
          pubkey: '020000000000000000000000000000000000000000000000000000000000000002',
        },
        {
          type: 'Lightning',
          label: 'Lightning',
          lightning_address: 'alice@satspath.com',
        },
        {
          type: 'Onchain',
          label: 'Onchain',
          network: 'mainnet',
          address: 'bc1qtestaddress999999999999999999999999',
          address_list: ['bc1qtestaddress999999999999999999999999'],
        },
      ],
      updated_at: 1700000000,
      preferences: ['Ark', 'Lightning', 'Onchain'],
      method_verifications: [],
    }

    it('creates a valid signature that verifies successfully', () => {
      const signed = signSatsPathProfile(baseProfile, testPrivKey)
      expect(signed.signature.length).toBe(128)
      expect(verifySatsPathProfileSignature(signed)).toBe(true)
    })

    it('rejects tampered profiles or invalid signatures', () => {
      const signed = signSatsPathProfile(baseProfile, testPrivKey)
      const tamperedProfile: SignedPaymentProfile = {
        profile: {
          ...baseProfile,
          alias: 'mallory@satspath.com',
        },
        signature: signed.signature,
      }
      expect(verifySatsPathProfileSignature(tamperedProfile)).toBe(false)

      const invalidSigProfile: SignedPaymentProfile = {
        profile: baseProfile,
        signature: '0'.repeat(128),
      }
      expect(verifySatsPathProfileSignature(invalidSigProfile)).toBe(false)
    })

    it('rejects profiles with an odd-Y (03) prefixed identity_pubkey', () => {
      // A 03-prefix pubkey represents odd-Y parity, which is a different key
      // from the even-Y variant. Stripping the prefix silently would use the
      // wrong verification key; instead verifySatsPathProfileSignature must
      // return false so signers cannot substitute parity.
      // The signature is over the 03-prefix profile so this is a true test of
      // parity-substitution rejection, not just a bad-signature catch.
      const oddYProfile: SignedPaymentProfile = {
        profile: { ...baseProfile, identity_pubkey: `03${testPubKeyHex}` },
        signature: signSatsPathProfile({ ...baseProfile, identity_pubkey: `03${testPubKeyHex}` }, testPrivKey)
          .signature,
      }
      expect(verifySatsPathProfileSignature(oddYProfile)).toBe(false)
    })

    it('rejects profiles whose expires_at is in the past', () => {
      const expiredProfile = signSatsPathProfile(
        { ...baseProfile, expires_at: Math.floor(Date.now() / 1000) - 3600 },
        testPrivKey,
      )
      expect(verifySatsPathProfileSignature(expiredProfile)).toBe(false)
    })

    it('accepts profiles whose expires_at is in the future', () => {
      const futureProfile = signSatsPathProfile(
        { ...baseProfile, expires_at: Math.floor(Date.now() / 1000) + 86400 },
        testPrivKey,
      )
      expect(verifySatsPathProfileSignature(futureProfile)).toBe(true)
    })

    it('accepts profiles with no expires_at field', () => {
      // expires_at is optional; absence must not be treated as expiry.
      const noExpiryProfile = signSatsPathProfile(baseProfile, testPrivKey)
      expect(verifySatsPathProfileSignature(noExpiryProfile)).toBe(true)
    })
  })

  describe('buildSatsPathUnifiedUri', () => {
    it('builds a single onchain address URI', () => {
      const uri = buildSatsPathUnifiedUri({
        onchainAddress: 'bc1qexample',
      })
      expect(uri).toBe('bitcoin:bc1qexample')
    })

    it('builds a multi-rail unified BIP-21 URI with amount and params', () => {
      const uri = buildSatsPathUnifiedUri({
        onchainAddress: 'bc1qexample',
        arkAddress: 'ark1qqexample',
        lightningInvoice: 'lnbc100u1p...',
        amountSats: 21000,
        label: 'Coffee Payment',
        message: 'Order #42',
      })

      expect(uri).toContain('bitcoin:bc1qexample?')
      expect(uri).toContain('amount=0.00021000')
      expect(uri).toContain('ark=ark1qqexample')
      expect(uri).toContain('lightning=LNBC100U1P...')
      expect(uri).toContain('label=Coffee+Payment')
      expect(uri).toContain('message=Order+%2342')
    })

    it('returns empty string if neither onchain nor ark address is provided', () => {
      expect(buildSatsPathUnifiedUri({})).toBe('')
    })
  })

  describe('analyzeSatsPathRoutes', () => {
    const testPrivKey = new Uint8Array(32).fill(3)
    const testPubKeyHex = bytesToHex(schnorr.getPublicKey(testPrivKey))

    const validProfileData: PaymentProfile = {
      alias: 'alice@satspath.com',
      identity_pubkey: testPubKeyHex,
      methods: [
        {
          type: 'Ark',
          label: 'Ark',
          server: 'https://ark.satspath.com',
          pubkey: '020000000000000000000000000000000000000000000000000000000000000002',
        },
        {
          type: 'Lightning',
          label: 'Lightning',
          lightning_address: 'alice@satspath.com',
        },
        {
          type: 'Onchain',
          label: 'Onchain',
          network: 'mainnet',
          address: 'bc1qtestaddress999999999999999999999999',
          address_list: ['bc1qtestaddress999999999999999999999999'],
        },
      ],
      updated_at: 1700000000,
      preferences: ['Ark', 'Lightning', 'Onchain'],
      method_verifications: [],
    }

    const validSignedProfile = signSatsPathProfile(validProfileData, testPrivKey)
    const invalidSignedProfile: SignedPaymentProfile = {
      profile: validProfileData,
      signature: '0'.repeat(128),
    }

    it('generates multi-rail quotes for Ark, Lightning, and Onchain with verified profile', async () => {
      const analysis = await analyzeSatsPathRoutes(validSignedProfile, 50_000, 'normal', 'alice@satspath.com', {
        fastest_fee: 25,
        half_hour_fee: 15,
        hour_fee: 10,
        minimum_fee: 5,
      })

      expect(analysis.recipient).toBe('alice@satspath.com')
      expect(analysis.isVerifiedProfile).toBe(true)
      expect(analysis.quotes.ark).toBeDefined()
      expect(analysis.quotes.ark?.rail).toBe('Ark')
      expect(analysis.quotes.ark?.estimatedFeeSats).toBe(0)

      expect(analysis.quotes.lightning).toBeDefined()
      expect(analysis.quotes.lightning?.rail).toBe('Lightning')
      expect(analysis.quotes.lightning?.destination).toBe('alice@satspath.com')

      expect(analysis.quotes.onchain).toBeDefined()
      expect(analysis.quotes.onchain?.rail).toBe('Onchain')
      expect(analysis.quotes.onchain?.destination).toBe('bc1qtestaddress999999999999999999999999')
    })

    it('marks profile as unverified when signature is invalid', async () => {
      const analysis = await analyzeSatsPathRoutes(invalidSignedProfile, 50_000, 'normal', 'alice@satspath.com', {
        fastest_fee: 25,
        half_hour_fee: 15,
        hour_fee: 10,
        minimum_fee: 5,
      })

      expect(analysis.recipient).toBe('alice@satspath.com')
      expect(analysis.isVerifiedProfile).toBe(false)
    })
  })

  describe('getFeeEstimate', () => {
    it('returns mocked fee estimate on success', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          fastestFee: 30,
          halfHourFee: 20,
          hourFee: 15,
          economyFee: 10,
          minimumFee: 5,
        }),
      )
      const fees = await getFeeEstimate(true)
      expect(fees).toBeDefined()
      expect(fees.fastest_fee).toBe(30)
      expect(fees.half_hour_fee).toBe(20)
      expect(fees.hour_fee).toBe(15)
      expect(fees.minimum_fee).toBe(5)
    })

    it('falls back to FALLBACK_FEES on network rejection', async () => {
      fetchMocker.mockRejectOnce(new Error('Network error'))
      const fees = await getFeeEstimate(true)
      expect(fees).toBeDefined()
      expect(typeof fees.fastest_fee).toBe('number')
      expect(typeof fees.half_hour_fee).toBe('number')
      expect(typeof fees.hour_fee).toBe('number')
      expect(typeof fees.minimum_fee).toBe('number')
    })
  })
})
