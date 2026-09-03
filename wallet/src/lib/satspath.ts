/**
 * Check if a value looks like a SatsPath alias (user@domain.tld format)
 */
export const isSatsPathAlias = (value: string): boolean => {
  // Basic format: local@domain.tld
  const aliasRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  return aliasRegex.test(value)
}

/**
 * Extract payment address from BIP21 URI
 */
export const extractBtcAddressFromBip21 = (bip21Uri: string): string => {
  try {
    const url = new URL(bip21Uri)
    return url.pathname.replace(/^bitcoin:/, '').split('?')[0]
  } catch {
    return bip21Uri
  }
}

export interface SatsPathQuote {
  status: string
  selected_method: { type: string }
  qr: string
  fee_sats: number
  recipient: { alias: string }
}

/**
 * Extract payment details from a SatsPath quote response
 */
export const extractRailFromQuote = (
  quote: SatsPathQuote,
): {
  address?: string
  arkAddress?: string
  invoice?: string
  lnUrl?: string
} => {
  const { qr, selected_method } = quote

  switch (selected_method.type) {
    case 'Lightning':
      // Lightning address or LNURL — wallet resolves via LNURL to get BOLT11
      return { lnUrl: qr }
    case 'Ark':
      // Direct native address (tark1qq... or ark1qq...)
      if (qr.startsWith('tark1') || qr.startsWith('ark1')) {
        return { arkAddress: qr }
      }
      // If ark: URI contains a native address in pathname or query
      if (qr.startsWith('ark:')) {
        try {
          const stripped = qr.slice('ark:'.length)
          const [mainPart, queryPart] = stripped.split('?')
          if (mainPart.startsWith('tark1') || mainPart.startsWith('ark1')) {
            return { arkAddress: mainPart }
          }
          if (queryPart) {
            const params = new URLSearchParams(queryPart)
            const addr = params.get('address') || params.get('opaque_uri')
            if (addr && (addr.startsWith('tark1') || addr.startsWith('ark1'))) {
              return { arkAddress: addr }
            }
          }
        } catch {}
      }
      return { arkAddress: qr }
    case 'Onchain':
      return { address: extractBtcAddressFromBip21(qr) }
    default:
      return {}
  }
}

/**
 * Get the rail icon for a payment method
 */
export const getRailIcon = (rail: string): string => {
  switch (rail) {
    case 'Lightning':
      return '⚡'
    case 'Ark':
      return '🏹'
    case 'Onchain':
      return '⛓️'
    default:
      return '💸'
  }
}

/**
 * Get the rail label for a payment method
 */
export const getRailLabel = (rail: string): string => {
  switch (rail) {
    case 'Lightning':
      return 'Lightning'
    case 'Ark':
      return 'Ark'
    case 'Onchain':
      return 'On-chain'
    default:
      return rail
  }
}

/**
 * Format fee for display
 */
export const formatFee = (feeSats: number): string => {
  if (feeSats === 0) return 'Free'
  if (feeSats < 1) return '<1 sat'
  return `${feeSats} sats`
}

/**
 * Validate that a quote is ready for payment
 */
export const isQuoteReady = (quote: SatsPathQuote | null | undefined): boolean => {
  if (!quote) return false
  return quote.status === 'ok' && Boolean(quote.qr)
}

/**
 * Build a QR string for a specific payment method and amount
 */
export const buildQrForRail = (
  method: {
    type: string
    lightning_address?: string
    address?: string
    server?: string
    pubkey?: string
    opaque_uri?: string
  },
  amountSats: number,
): string => {
  switch (method.type) {
    case 'Lightning':
      return method.lightning_address ?? ''
    case 'Onchain':
      return method.address ? `bitcoin:${method.address}?amount=${(amountSats / 1e8).toFixed(8)}` : ''
    case 'Ark':
      if (method.opaque_uri) return method.opaque_uri
      if (method.pubkey?.startsWith('tark1') || method.pubkey?.startsWith('ark1')) return method.pubkey
      if (method.address?.startsWith('tark1') || method.address?.startsWith('ark1')) return method.address
      return method.server && method.pubkey
        ? `ark:${method.pubkey}?server=${encodeURIComponent(method.server)}&amount=${amountSats}`
        : ''
    default:
      return ''
  }
}
