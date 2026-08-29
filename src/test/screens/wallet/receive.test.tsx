import { describe, expect, it } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import {
  buildSatsPathUnifiedUri,
  createOwnPaymentProfile,
  createSignedProfileFromWallet,
  DEFAULT_PROFILE_TTL_SECONDS,
  verifySatsPathProfileSignature,
} from '../../../lib/satspath'
import { SignedPaymentProfile } from '@satspath/resolvers'
import { render, screen } from '@testing-library/react'
import SatsPathIdentityCard from '../../../components/SatsPathIdentityCard'

const testPrivKey = new Uint8Array(32).fill(9)
const testPubKeyHex = bytesToHex(schnorr.getPublicKey(testPrivKey))

function buildOwnSignedProfile(
  overrides: Partial<Parameters<typeof createSignedProfileFromWallet>[0]> = {},
): SignedPaymentProfile {
  return createSignedProfileFromWallet({
    alias: 'me@arkade.money',
    privateKey: testPrivKey,
    arkAddress: 'ark1offchainaddr',
    onchainAddress: 'bc1pboardingaddr',
    lightningInvoice: 'lnbc TEST INVOICE',
    ...overrides,
  })
}

describe('SatsPath own profile generation (Fase 5)', () => {
  it('createOwnPaymentProfile derives the identity pubkey from the private key', () => {
    const profile = createOwnPaymentProfile({
      alias: 'me@arkade.money',
      privateKey: testPrivKey,
      arkAddress: 'ark1offchainaddr',
      onchainAddress: 'bc1pboardingaddr',
    })
    expect(profile.identity_pubkey).toBe(testPubKeyHex)
    expect(profile.alias).toBe('me@arkade.money')
  })

  it('createOwnPaymentProfile includes all three rails and sets a safe TTL', () => {
    const before = Math.floor(Date.now() / 1000)
    const profile = createOwnPaymentProfile({
      alias: 'me@arkade.money',
      privateKey: testPrivKey,
      arkAddress: 'ark1offchainaddr',
      arkServer: 'https://asp.arkade.money',
      onchainAddress: 'bc1pboardingaddr',
      lightningAddress: 'me@walletofsatoshi.com',
      network: 'mainnet',
    })
    const types = profile.methods.map((m) => m.type).sort()
    expect(types).toEqual(['Ark', 'Lightning', 'Onchain'])
    expect(profile.expires_at).toBeGreaterThanOrEqual(before + DEFAULT_PROFILE_TTL_SECONDS - 2)
    expect(profile.expires_at).toBeLessThanOrEqual(before + DEFAULT_PROFILE_TTL_SECONDS + 2)
  })

  it('createSignedProfileFromWallet produces a verifiable Schnorr signature', () => {
    const signed = buildOwnSignedProfile()
    expect(signed.signature.length).toBe(128)
    expect(verifySatsPathProfileSignature(signed)).toBe(true)
  })

  it('rejects a tampered profile', () => {
    const signed = buildOwnSignedProfile()
    const tampered: SignedPaymentProfile = {
      ...signed,
      profile: { ...signed.profile, alias: 'attacker@arkade.money' },
    }
    expect(verifySatsPathProfileSignature(tampered)).toBe(false)
  })

  it('omits the Lightning rail when no lightning details are supplied', () => {
    const profile = createOwnPaymentProfile({
      alias: 'me@arkade.money',
      privateKey: testPrivKey,
      arkAddress: 'ark1offchainaddr',
      onchainAddress: 'bc1pboardingaddr',
    })
    expect(profile.methods.map((m) => m.type)).not.toContain('Lightning')
  })

  it('expired profiles fail verification', () => {
    const signed = createSignedProfileFromWallet({
      alias: 'me@arkade.money',
      privateKey: testPrivKey,
      arkAddress: 'ark1offchainaddr',
      onchainAddress: 'bc1pboardingaddr',
      ttlSeconds: -10,
    })
    expect(verifySatsPathProfileSignature(signed)).toBe(false)
  })
})

describe('SatsPath multi-rail unified QR (Fase 5)', () => {
  it('builds a BIP-21 URI with ark, lightning and amount parameters', () => {
    const uri = buildSatsPathUnifiedUri({
      onchainAddress: 'bc1pboardingaddr',
      arkAddress: 'ark1offchainaddr',
      lightningInvoice: 'lnbc test invoice',
      amountSats: 50_000,
      label: 'Arkade SatsPath',
    })
    expect(uri.startsWith('bitcoin:bc1pboardingaddr?')).toBe(true)
    const params = new URLSearchParams(uri.split('?')[1])
    expect(params.get('amount')).toBe((50_000 / 100_000_000).toFixed(8))
    expect(params.get('ark')).toBe('ark1offchainaddr')
    expect(params.get('lightning')).toBe('LNBC TEST INVOICE'.toUpperCase())
    expect(params.get('label')).toBe('Arkade SatsPath')
  })

  it('embeds a URL-encoded signed profile when provided', () => {
    const signed = buildOwnSignedProfile()
    const uri = buildSatsPathUnifiedUri({
      onchainAddress: 'bc1pboardingaddr',
      arkAddress: 'ark1offchainaddr',
      satspathProfile: encodeURIComponent(JSON.stringify(signed)),
    })
    const params = new URLSearchParams(uri.split('?')[1])
    expect(params.get('satspath_profile')).toBe(encodeURIComponent(JSON.stringify(signed)))
  })

  it('falls back to the base address when no rails are available', () => {
    expect(buildSatsPathUnifiedUri({ onchainAddress: 'bc1pboardingaddr' })).toBe('bitcoin:bc1pboardingaddr')
    expect(buildSatsPathUnifiedUri({})).toBe('')
  })
})

describe('SatsPathIdentityCard', () => {
  it('renders the alias, identity key and active rails', () => {
    const signed = buildOwnSignedProfile()
    render(<SatsPathIdentityCard profile={signed} rawProfile={JSON.stringify(signed)} />)
    expect(screen.getByText('me@arkade.money')).toBeTruthy()
    expect(screen.getByText('Ark (VTXO)')).toBeTruthy()
    expect(screen.getByText('Lightning')).toBeTruthy()
    expect(screen.getByText('Bitcoin L1')).toBeTruthy()
    expect(screen.getByText('Share Profile')).toBeTruthy()
  })
})
