import { describe, expect, it } from 'vitest'
import {
  buildQrForRail,
  extractBtcAddressFromBip21,
  extractRailFromQuote,
  formatFee,
  getRailIcon,
  getRailLabel,
  isQuoteReady,
  isSatsPathAlias,
  SatsPathQuote,
} from '../../lib/satspath'

describe('SatsPath Integration & Rail Resolution', () => {
  describe('isSatsPathAlias', () => {
    it('correctly identifies valid SatsPath aliases', () => {
      expect(isSatsPathAlias('alice@arkade.money')).toBe(true)
      expect(isSatsPathAlias('bob@satspath.dev')).toBe(true)
      expect(isSatsPathAlias('user.name+tag@domain.co.uk')).toBe(true)
      expect(isSatsPathAlias('chelo@arkade.sh')).toBe(true)
    })

    it('rejects invalid aliases', () => {
      expect(isSatsPathAlias('invalid')).toBe(false)
      expect(isSatsPathAlias('@domain.com')).toBe(false)
      expect(isSatsPathAlias('user@')).toBe(false)
      expect(isSatsPathAlias('user@domain')).toBe(false)
      expect(isSatsPathAlias('user @domain.com')).toBe(false)
      expect(isSatsPathAlias('')).toBe(false)
    })
  })

  describe('extractBtcAddressFromBip21', () => {
    it('extracts raw address from bip21 URI with query params', () => {
      const uri = 'bitcoin:tb1pqpelk400jtxat9hdd0ungyu6s05zjtdf85uj9?amount=0.00010000'
      expect(extractBtcAddressFromBip21(uri)).toBe('tb1pqpelk400jtxat9hdd0ungyu6s05zjtdf85uj9')
    })

    it('extracts address from plain bitcoin: URI', () => {
      const uri = 'bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'
      expect(extractBtcAddressFromBip21(uri)).toBe('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')
    })

    it('returns original string if already a plain address', () => {
      const addr = 'tb1q90847yuhkdjnfskjdnf'
      expect(extractBtcAddressFromBip21(addr)).toBe(addr)
    })
  })

  describe('extractRailFromQuote', () => {
    it('extracts Lightning rail as lnUrl for LNURL/bolt11 flow', () => {
      const quote: SatsPathQuote = {
        status: 'ok',
        selected_method: { type: 'Lightning' },
        qr: 'alice@satspath.dev',
        fee_sats: 1,
        recipient: { alias: 'alice@satspath.dev' },
      }
      const rail = extractRailFromQuote(quote)
      expect(rail.lnUrl).toBe('alice@satspath.dev')
      expect(rail.arkAddress).toBeUndefined()
      expect(rail.address).toBeUndefined()
    })

    it('extracts native Ark address directly when qr is tark1...', () => {
      const tarkAddr = 'tark1qqcpqyqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'
      const quote: SatsPathQuote = {
        status: 'ok',
        selected_method: { type: 'Ark' },
        qr: tarkAddr,
        fee_sats: 0,
        recipient: { alias: 'bob@arkade.money' },
      }
      const rail = extractRailFromQuote(quote)
      expect(rail.arkAddress).toBe(tarkAddr)
      expect(rail.lnUrl).toBeUndefined()
      expect(rail.address).toBeUndefined()
    })

    it('extracts Ark address when encoded in ark: URI path', () => {
      const tarkAddr = 'tark1qqcpqyqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'
      const quote: SatsPathQuote = {
        status: 'ok',
        selected_method: { type: 'Ark' },
        qr: `ark:${tarkAddr}?server=https%3A%2F%2Fmutinynet.arkade.sh&amount=1000`,
        fee_sats: 0,
        recipient: { alias: 'bob@arkade.money' },
      }
      const rail = extractRailFromQuote(quote)
      expect(rail.arkAddress).toBe(tarkAddr)
    })

    it('extracts On-chain rail from BIP21 URI', () => {
      const quote: SatsPathQuote = {
        status: 'ok',
        selected_method: { type: 'Onchain' },
        qr: 'bitcoin:tb1pqpelk400jtxat9hdd0ungyu6s05zjtdf85uj9?amount=0.00500000',
        fee_sats: 150,
        recipient: { alias: 'carol@satspath.dev' },
      }
      const rail = extractRailFromQuote(quote)
      expect(rail.address).toBe('tb1pqpelk400jtxat9hdd0ungyu6s05zjtdf85uj9')
      expect(rail.arkAddress).toBeUndefined()
      expect(rail.lnUrl).toBeUndefined()
    })
  })

  describe('buildQrForRail', () => {
    it('builds Lightning QR payload from lightning_address', () => {
      const method = { type: 'Lightning', lightning_address: 'alice@domain.com' }
      expect(buildQrForRail(method, 5000)).toBe('alice@domain.com')
    })

    it('builds Onchain BIP-21 URI with formatted btc amount', () => {
      const method = { type: 'Onchain', address: 'tb1qtestaddress123' }
      expect(buildQrForRail(method, 100000)).toBe('bitcoin:tb1qtestaddress123?amount=0.00100000')
    })

    it('builds Ark payload from opaque_uri when available', () => {
      const tarkAddr = 'tark1qqcpqyqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'
      const method = {
        type: 'Ark',
        opaque_uri: tarkAddr,
        server: 'https://mutinynet.arkade.sh',
        pubkey: '02abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      }
      expect(buildQrForRail(method, 2000)).toBe(tarkAddr)
    })

    it('builds ark: URI when server and pubkey are provided without opaque_uri', () => {
      const method = {
        type: 'Ark',
        server: 'https://mutinynet.arkade.sh',
        pubkey: '02abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      }
      expect(buildQrForRail(method, 2000)).toBe(
        'ark:02abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890?server=https%3A%2F%2Fmutinynet.arkade.sh&amount=2000',
      )
    })
  })

  describe('formatFee and helpers', () => {
    it('formats fees accurately', () => {
      expect(formatFee(0)).toBe('Free')
      expect(formatFee(0.5)).toBe('<1 sat')
      expect(formatFee(12)).toBe('12 sats')
    })

    it('returns appropriate rail icons and labels', () => {
      expect(getRailIcon('Lightning')).toBe('⚡')
      expect(getRailIcon('Ark')).toBe('🏹')
      expect(getRailIcon('Onchain')).toBe('⛓️')

      expect(getRailLabel('Lightning')).toBe('Lightning')
      expect(getRailLabel('Ark')).toBe('Ark')
      expect(getRailLabel('Onchain')).toBe('On-chain')
    })

    it('verifies quote readiness', () => {
      expect(isQuoteReady(null)).toBe(false)
      expect(isQuoteReady(undefined)).toBe(false)
      expect(
        isQuoteReady({
          status: 'ok',
          qr: 'tark1...',
          selected_method: { type: 'Ark' },
          fee_sats: 0,
          recipient: { alias: 'a@b.com' },
        }),
      ).toBe(true)
      expect(
        isQuoteReady({
          status: 'error',
          qr: '',
          selected_method: { type: 'Ark' },
          fee_sats: 0,
          recipient: { alias: 'a@b.com' },
        }),
      ).toBe(false)
    })
  })
})
