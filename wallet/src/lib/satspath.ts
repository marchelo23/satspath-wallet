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
      // Lightning address — wallet needs to resolve via LNURL to get BOLT11
      return { lnUrl: qr }
    case 'Ark':
      // For Ark, try to extract native tark address from qr or use it as-is
      // The wallet.send() only accepts tark1qq... format addresses
      if (qr.startsWith('tark1') || qr.startsWith('ark1')) {
        return { arkAddress: qr }
      }
      // ark: URI — store as lnUrl won't help; mark as unsupported for now
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
  method: { type: string; lightning_address?: string; address?: string; server?: string; pubkey?: string },
  amountSats: number,
): string => {
  switch (method.type) {
    case 'Lightning':
      return method.lightning_address ?? ''
    case 'Onchain':
      return method.address ? `bitcoin:${method.address}?amount=${(amountSats / 1e8).toFixed(8)}` : ''
    case 'Ark':
      return method.server && method.pubkey
        ? `ark:${method.pubkey}?server=${encodeURIComponent(method.server)}&amount=${amountSats}`
        : ''
    default:
      return ''
  }
}
