import { bech32, utf8 } from '@scure/base'

const emailRegex =
  /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/

export type LnUrlResponse = {
  commentAllowed?: number
  callback: string
  minSendable: number
  maxSendable: number
  metadata: string
  transferAmounts?: {
    method: string
    available: boolean
  }[]
}

type ArkMethodResponse = {
  expiryDate: string
  address: string
  hint: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type LnUrlCallbackResponse = {
  pr: string
}

const checkResponse = async <T = any>(response: Response): Promise<T> => {
  if (!response.ok) return Promise.reject(response)
  const data = await response.json()
  if (data.status === 'ERROR') return Promise.reject(data.reason || 'LNURL error')
  return data
}

const checkLnUrlResponse = (amount: number, data: LnUrlResponse) => {
  if (amount < data.minSendable || amount > data.maxSendable) {
    throw new Error('Amount not in LNURL range.')
  }
  return data
}

const fetchLnUrlInvoice = async (amount: number, note: string, data: LnUrlResponse) => {
  let url = `${data.callback}?amount=${amount}`
  if (note) url += `&comment=${note}`
  const res = await fetch(url, { redirect: 'error' }).then(checkResponse<LnUrlCallbackResponse>)
  return res.pr
}

const isValidBech32 = (data: string) => {
  try {
    bech32.decodeToBytes(data)
    return true
  } catch {
    return false
  }
}

const isLnUrl = (data: string) => {
  return data.toLowerCase().startsWith('lnurl') && isValidBech32(data)
}

const isLnAddress = (data: string) => {
  return data.includes('@') && emailRegex.test(data)
}

export const isValidLnUrl = (data: string): boolean => isLnUrl(data) || isLnAddress(data)

/**
 * Validates that an LNURL endpoint or callback URL uses HTTPS and does not
 * point to localhost, loopback, link-local, or private-network IP ranges (SSRF prevention).
 */
export const isSafeLnUrlEndpoint = (rawUrl: string): boolean => {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:') return false
    let hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (
      !hostname ||
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname === '0.0.0.0' ||
      hostname === '::' ||
      hostname === '::1'
    ) {
      return false
    }

    // Handle IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (hostname.startsWith('::ffff:')) {
      const rest = hostname.slice(7)
      if (rest.includes('.')) {
        hostname = rest
      } else {
        const parts = rest.split(':')
        if (parts.length === 2) {
          const high = parseInt(parts[0], 16)
          const low = parseInt(parts[1], 16)
          const b1 = (high >> 8) & 0xff
          const b2 = high & 0xff
          const b3 = (low >> 8) & 0xff
          const b4 = low & 0xff
          hostname = `${b1}.${b2}.${b3}.${b4}`
        } else {
          return false
        }
      }
    }

    if (
      hostname.startsWith('127.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') ||
      hostname.startsWith('0.')
    ) {
      return false
    }

    // Check IPv6 link-local (fe80::/10 includes fe80-febf) and unique-local (fc00::/7)
    if (
      /^fe[89ab][0-9a-f]:/i.test(hostname) ||
      hostname.startsWith('fe80:') ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd')
    ) {
      return false
    }

    const match172 = hostname.match(/^172\.(\d+)\./)
    if (match172) {
      const secondOctet = parseInt(match172[1], 10)
      if (secondOctet >= 16 && secondOctet <= 31) return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * Validates that a Lightning address or LNURL string parses and resolves to a safe HTTPS endpoint.
 */
export const isSafeLnUrl = (data: string): boolean => {
  if (!isValidLnUrl(data)) return false
  try {
    const url = getCallbackUrl(data)
    return isSafeLnUrlEndpoint(url)
  } catch {
    return false
  }
}

export const getCallbackUrl = (lnurl: string): string => {
  if (isLnAddress(lnurl)) {
    // Lightning address
    const urlsplit = lnurl.split('@')
    return `https://${urlsplit[1]}/.well-known/lnurlp/${urlsplit[0]}`
  }
  // LNURL
  const { bytes } = bech32.decodeToBytes(lnurl)
  return utf8.encode(bytes)
}

export const checkLnUrlConditions = (lnurl: string): Promise<LnUrlResponse> => {
  return new Promise<LnUrlResponse>((resolve, reject) => {
    if (!isValidLnUrl(lnurl)) {
      return reject(new Error('Insecure or prohibited LNURL endpoint'))
    }
    let url: string
    try {
      url = getCallbackUrl(lnurl)
    } catch (e) {
      return reject(e)
    }
    if (!isSafeLnUrlEndpoint(url)) {
      return reject(new Error('Insecure or prohibited LNURL endpoint'))
    }
    fetch(url, { redirect: 'error' })
      .then(checkResponse<LnUrlResponse>)
      .then((data) => {
        if (data.callback && !isSafeLnUrlEndpoint(data.callback)) {
          throw new Error('Insecure or prohibited callback URL in LNURL response')
        }
        resolve(data)
      })
      .catch(reject)
  })
}

export const fetchInvoice = (lnurl: string, sats: number, note: string): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    if (!isValidLnUrl(lnurl)) {
      return reject(new Error('Insecure or prohibited LNURL endpoint'))
    }
    let url: string
    try {
      url = getCallbackUrl(lnurl)
    } catch (e) {
      return reject(e)
    }
    if (!isSafeLnUrlEndpoint(url)) {
      return reject(new Error('Insecure or prohibited LNURL endpoint'))
    }
    const amount = Math.round(sats * 1000) // millisatoshis
    fetch(url, { redirect: 'error' })
      .then(checkResponse<LnUrlResponse>)
      .then((data) => {
        if (data.callback && !isSafeLnUrlEndpoint(data.callback)) {
          throw new Error('Insecure or prohibited callback URL in LNURL response')
        }
        return checkLnUrlResponse(amount, data)
      })
      .then((data) => fetchLnUrlInvoice(amount, note, data))
      .then(resolve)
      .catch(reject)
  })
}

export const fetchArkAddress = (lnurl: string): Promise<ArkMethodResponse> => {
  return new Promise<ArkMethodResponse>((resolve, reject) => {
    if (!isValidLnUrl(lnurl)) {
      return reject(new Error('Insecure or prohibited LNURL endpoint'))
    }
    let url: string
    try {
      url = getCallbackUrl(lnurl)
    } catch (e) {
      return reject(e)
    }
    if (!isSafeLnUrlEndpoint(url)) {
      return reject(new Error('Insecure or prohibited LNURL endpoint'))
    }
    fetch(url + '?method=ark', { redirect: 'error' })
      .then(checkResponse<ArkMethodResponse>)
      .then(resolve)
      .catch(reject)
  })
}
