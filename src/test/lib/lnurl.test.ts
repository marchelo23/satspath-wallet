import fixtures from '../fixtures.json'
import createFetchMock from 'vitest-fetch-mock'
import { describe, expect, it, vi } from 'vitest'
import {
  checkLnUrlConditions,
  fetchInvoice,
  getCallbackUrl,
  isValidLnUrl,
  isSafeLnUrl,
  isSafeLnUrlEndpoint,
} from '../../lib/lnurl'

const fetchMocker = createFetchMock(vi)

fetchMocker.enableMocks()

const mockLNURLResponse = {
  callback: 'https://pay.staging.galoy.io/.well-known/lnurlp/testing',
  minSendable: 1000,
  maxSendable: 100000000000,
  metadata: 'mock-metadata',
}

describe('lnurl utilities', () => {
  it('should decode lnurl values', async () => {
    for (const test of fixtures.lib.lnurl) {
      expect(test).toHaveProperty('lnUrlOrAddress')
      expect(isValidLnUrl(test.lnUrlOrAddress)).toBe(true)
      expect(getCallbackUrl(test.lnUrlOrAddress)).toBe(test.callback)
    }
  })

  it('should fetch lnurl conditions', async () => {
    for (const test of fixtures.lib.lnurl) {
      const localMockResponse = { ...mockLNURLResponse, callback: test.callback }
      fetchMocker.mockResponseOnce(JSON.stringify(localMockResponse))
      expect(await checkLnUrlConditions(test.lnUrlOrAddress)).toEqual(localMockResponse)
    }
  })

  it('should fetch lightning invoice', async () => {
    for (const test of fixtures.lib.lnurl) {
      const localMockResponse = { ...mockLNURLResponse, callback: test.callback }
      fetchMocker.mockResponseOnce(JSON.stringify(localMockResponse))
      fetchMocker.mockResponseOnce(JSON.stringify({ pr: 'lnbc1234567890' }))
      expect(await fetchInvoice(test.lnUrlOrAddress, 21, '')).toBe('lnbc1234567890')
    }
  })

  describe('isSafeLnUrlEndpoint and isSafeLnUrl', () => {
    it('accepts valid public HTTPS endpoints and addresses', () => {
      expect(isSafeLnUrlEndpoint('https://pay.staging.galoy.io/.well-known/lnurlp/test')).toBe(true)
      expect(isSafeLnUrlEndpoint('https://example.com/lnurlp/alice')).toBe(true)
      expect(isSafeLnUrl('alice@example.com')).toBe(true)
    })

    it('rejects non-HTTPS schemes', () => {
      expect(isSafeLnUrlEndpoint('http://example.com/lnurlp/alice')).toBe(false)
      expect(isSafeLnUrlEndpoint('ftp://example.com/lnurlp/alice')).toBe(false)
    })

    it('rejects loopback and local hostnames', () => {
      expect(isSafeLnUrlEndpoint('https://localhost/.well-known/lnurlp/test')).toBe(false)
      expect(isSafeLnUrlEndpoint('https://sub.localhost/.well-known/lnurlp/test')).toBe(false)
      expect(isSafeLnUrlEndpoint('https://host.local/.well-known/lnurlp/test')).toBe(false)
      expect(isSafeLnUrlEndpoint('https://host.internal/.well-known/lnurlp/test')).toBe(false)
      expect(isSafeLnUrl('user@localhost')).toBe(false)
    })

    it('rejects loopback and private IP addresses', () => {
      expect(isSafeLnUrlEndpoint('https://127.0.0.1/lnurlp')).toBe(false)
      expect(isSafeLnUrlEndpoint('https://127.0.1.1/lnurlp')).toBe(false)
      expect(isSafeLnUrlEndpoint('https://10.0.0.1/lnurlp')).toBe(false)
      expect(isSafeLnUrlEndpoint('https://192.168.1.1/lnurlp')).toBe(false)
      expect(isSafeLnUrlEndpoint('https://172.16.0.1/lnurlp')).toBe(false)
      expect(isSafeLnUrlEndpoint('https://172.31.255.255/lnurlp')).toBe(false)
      expect(isSafeLnUrlEndpoint('https://169.254.169.254/lnurlp')).toBe(false)
      expect(isSafeLnUrlEndpoint('https://[::1]/lnurlp')).toBe(false)
      expect(isSafeLnUrl('user@127.0.0.1')).toBe(false)
    })

    it('rejects prohibited targets during checkLnUrlConditions', async () => {
      await expect(checkLnUrlConditions('user@test.localhost')).rejects.toThrow(/Insecure or prohibited LNURL endpoint/)
      await expect(checkLnUrlConditions('user@localhost')).rejects.toThrow(/Insecure or prohibited LNURL endpoint/)
    })
  })
})
