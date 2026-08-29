import { describe, expect, it } from 'vitest'
import {
  isSatsPathIdentifier,
  resolveSatsPathProfile,
  getFeeEstimate,
  analyzeSatsPathRoutes,
  buildSatsPathUnifiedUri,
} from '../../lib/satspath'
import type { SignedPaymentProfile } from '@satspath/resolvers'

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
    it('handles non-existent or unresolvable identifier gracefully', async () => {
      const profile = await resolveSatsPathProfile('nonexistent-user-12345@unknown-domain-xyz.local')
      expect(profile).toBeNull()
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
    const mockProfile: SignedPaymentProfile = {
      profile: {
        alias: 'alice@satspath.com',
        identity_pubkey: '020000000000000000000000000000000000000000000000000000000000000001',
        methods: [
          {
            type: 'Ark',
            server: 'https://ark.satspath.com',
            pubkey: '020000000000000000000000000000000000000000000000000000000000000002',
          },
          {
            type: 'Lightning',
            lightning_address: 'alice@satspath.com',
          },
          {
            type: 'Onchain',
            address: 'bc1qtestaddress999999999999999999999999',
          },
        ],
        updated_at: 1700000000,
        preferences: ['Ark', 'Lightning', 'Onchain'],
        method_verifications: [],
      },
      signature: '0'.repeat(128),
    }

    it('generates multi-rail quotes for Ark, Lightning, and Onchain', async () => {
      const analysis = await analyzeSatsPathRoutes(mockProfile, 50_000, 'normal', 'alice@satspath.com', {
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
  })

  describe('getFeeEstimate', () => {
    it('returns fee estimate correctly', async () => {
      const fees = await getFeeEstimate()
      expect(fees).toBeDefined()
      expect(typeof fees.fastest_fee).toBe('number')
      expect(typeof fees.half_hour_fee).toBe('number')
      expect(typeof fees.hour_fee).toBe('number')
      expect(typeof fees.minimum_fee).toBe('number')
    })
  })
})
