/**
 * arkUri.ts — Parser and resolver for SatsPath `ark:` URIs.
 *
 * SatsPath quotes return `ark:` URIs when the cheapest/selected rail is Ark:
 *   ark:<pubkey>?server=<url>&amount=<sats>
 *
 * This module parses those URIs and resolves them to native `tark1...` /
 * `ark1...` addresses that Arkade SDK can send to directly.
 */

import { ArkAddress, DefaultVtxo, toXOnlySignerHex } from '@arkade-os/sdk'
import { hex } from '@scure/base'
import { AspInfo } from '../providers/asp'

export interface ParsedArkUri {
  pubkey: string
  server: string
  amount?: number
}

/**
 * Parse an `ark:` URI produced by SatsPath into its components.
 *
 * Format: `ark:<pubkey>?server=<url>&amount=<sats>`
 *
 * Throws if the URI is not a valid ark: URI.
 */
export function parseArkUri(uri: string): ParsedArkUri {
  if (!uri.startsWith('ark:')) {
    throw new Error(`Not an ark: URI: ${uri}`)
  }

  // Strip the scheme and split on '?'
  const withoutScheme = uri.slice('ark:'.length)
  const queryStart = withoutScheme.indexOf('?')

  if (queryStart === -1) {
    // No query params — just a raw pubkey or address
    return { pubkey: withoutScheme.trim(), server: '' }
  }

  const pubkey = withoutScheme.slice(0, queryStart).trim()
  const queryString = withoutScheme.slice(queryStart + 1)
  const params = new URLSearchParams(queryString)

  const server = params.get('server') ?? ''
  const amountStr = params.get('amount')
  const amount = amountStr ? parseInt(amountStr, 10) : undefined

  if (!pubkey) {
    throw new Error('ark: URI missing pubkey')
  }

  return { pubkey, server, amount }
}

/**
 * Resolve a parsed `ark:` URI to a native Ark address string.
 *
 * Strategy:
 * 1. If the server in the URI matches our connected ASP, build a native address
 *    directly using the recipient pubkey + our ASP's signer pubkey.
 * 2. If servers differ, the payment can't be executed via our ASP — throw.
 *
 * The returned address is a bech32m `tark1...` (testnet/mutinynet) or
 * `ark1...` (mainnet) string that Arkade SDK's `sendOffChain()` accepts.
 */
export function resolveArkUriToNative(parsed: ParsedArkUri, aspInfo: AspInfo): string {
  const { pubkey, server } = parsed

  // Normalise server URLs for comparison (strip trailing slash, lowercase)
  const normalise = (url: string) => url.replace(/\/+$/, '').toLowerCase()

  if (server && aspInfo.url && normalise(server) !== normalise(aspInfo.url)) {
    throw new Error(
      `Ark payment server mismatch. Recipient uses ${server}, but you are connected to ${aspInfo.url}. ` +
        `Choose On-chain to pay across servers.`,
    )
  }

  // Build the native Ark address from recipient pubkey + ASP signer pubkey
  const hrp = aspInfo.network === 'bitcoin' ? 'ark' : 'tark'
  try {
    const xOnlyRecipient = toXOnlySignerHex(pubkey)
    const xOnlySigner = toXOnlySignerHex(aspInfo.signerPubkey)

    return new DefaultVtxo.Script({
      pubKey: hex.decode(xOnlyRecipient),
      serverPubKey: hex.decode(xOnlySigner),
      csvTimelock: { value: aspInfo.unilateralExitDelay, type: 'seconds' },
    })
      .address(hrp, hex.decode(xOnlySigner))
      .encode()
  } catch (err) {
    throw new Error(`Failed to build Ark address from SatsPath URI: ${err instanceof Error ? err.message : err}`)
  }
}

/**
 * Convenience: parse + resolve in one call.
 */
export function parseAndResolveArkUri(uri: string, aspInfo: AspInfo): string {
  const parsed = parseArkUri(uri)
  return resolveArkUriToNative(parsed, aspInfo)
}
