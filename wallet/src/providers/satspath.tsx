import { ReactNode, createContext, useCallback, useEffect, useRef, useState } from 'react'
import init, {
  derive_identity_keypair_from_seed,
  quote as satspathQuote,
  verify_signed_profile,
  type IdentityKeypair,
} from '@satspath/wasm'
import * as bip39 from 'bip39'
import { consoleError } from '../lib/logs'

const SATSPATH_URL = import.meta.env.VITE_SATSPATH_URL || 'http://localhost:9737'
const SATSPATH_AUTH = import.meta.env.VITE_SATSPATH_AUTH_TOKEN || ''

export type SatsPathRail = 'Lightning' | 'Ark' | 'Onchain'

export interface SatsPathIdentity {
  pubkey_hex: string
  secret_key_hex: string
}

export interface SatsPathPaymentMethod {
  type: SatsPathRail
  lightning_address?: string
  address?: string
  server?: string
  pubkey?: string
}

export interface SatsPathQuoteResponse {
  status: string
  selected_method: { type: SatsPathRail }
  available_methods: SatsPathPaymentMethod[]
  qr: string
  fee_sats: number
  recipient: { alias: string }
}

export interface ResolvedQuote {
  status: 'ok' | 'error' | 'not_registered' | 'invalid_signature' | 'no_route'
  quote?: SatsPathQuoteResponse
  error?: string
}

export interface SatsPathDaemonProfile {
  wallet: {
    alias?: string
    identity_pubkey?: string
    lightning_address?: string
    onchain_address?: string
    ark_server?: string
  }
  signed_profile?: unknown
  signature_valid?: boolean
}

export interface SatsPathDaemonStatus {
  daemon: string
  version: string
  bind: string
  network: string
  wallet_initialized: boolean
  alias?: string
  identity_fingerprint?: string
  methods: string[]
}

interface SatsPathContextProps {
  initialized: boolean
  identity: SatsPathIdentity | null
  daemonUrl: string
  daemonConnected: boolean
  daemonProfile: SatsPathDaemonProfile | null
  daemonStatus: SatsPathDaemonStatus | null
  deriveIdentity: (mnemonic: string) => void
  resolveAndQuote: (alias: string, amountSats: number) => Promise<ResolvedQuote>
  verifyProfile: (profileJson: string) => boolean
  checkDaemonHealth: () => Promise<boolean>
  registerAlias: (alias: string) => Promise<{ challengeId: string; message: string }>
  verifyAlias: (alias: string, token: string) => Promise<SatsPathDaemonProfile>
  updateProfileMethods: (methods: {
    lightning_address?: string
    onchain_address?: string
    ark_server?: string
    ark_pubkey?: string
  }) => Promise<SatsPathDaemonProfile>
  refreshDaemonProfile: () => Promise<void>
}

export const SatsPathContext = createContext<SatsPathContextProps>({
  initialized: false,
  identity: null,
  daemonUrl: SATSPATH_URL,
  daemonConnected: false,
  daemonProfile: null,
  daemonStatus: null,
  deriveIdentity: () => {},
  resolveAndQuote: async () => ({ status: 'error', error: 'Not initialized' }),
  verifyProfile: () => false,
  checkDaemonHealth: async () => false,
  registerAlias: async () => ({ challengeId: '', message: '' }),
  verifyAlias: async () => ({} as SatsPathDaemonProfile),
  updateProfileMethods: async () => ({} as SatsPathDaemonProfile),
  refreshDaemonProfile: async () => {},
})

async function daemonFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${SATSPATH_URL}${path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (SATSPATH_AUTH) {
    headers['Authorization'] = `Bearer ${SATSPATH_AUTH}`
  }
  const res = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`SatsPath daemon error ${res.status}: ${body}`)
  }
  return res.json()
}

export const SatsPathProvider = ({ children }: { children: ReactNode }) => {
  const [initialized, setInitialized] = useState(false)
  const [identity, setIdentity] = useState<SatsPathIdentity | null>(null)
  const [daemonConnected, setDaemonConnected] = useState(false)
  const [daemonProfile, setDaemonProfile] = useState<SatsPathDaemonProfile | null>(null)
  const [daemonStatus, setDaemonStatus] = useState<SatsPathDaemonStatus | null>(null)
  const initRef = useRef(false)

  // Initialize WASM module once
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    init()
      .then(() => {
        setInitialized(true)
      })
      .catch((err) => {
        consoleError(err, 'Failed to initialize SatsPath WASM')
        initRef.current = false
      })
  }, [])

  const checkDaemonHealth = useCallback(async (): Promise<boolean> => {
    try {
      const res = await daemonFetch<SatsPathDaemonStatus>('/v1/status')
      setDaemonConnected(true)
      setDaemonStatus(res)
      return true
    } catch {
      setDaemonConnected(false)
      setDaemonStatus(null)
      return false
    }
  }, [])

  // Check daemon health on mount and periodically
  useEffect(() => {
    checkDaemonHealth()
    const interval = setInterval(checkDaemonHealth, 30_000)
    return () => clearInterval(interval)
  }, [checkDaemonHealth])

  const refreshDaemonProfile = useCallback(async () => {
    try {
      const profile = await daemonFetch<SatsPathDaemonProfile>('/v1/profile')
      setDaemonProfile(profile)
    } catch (err) {
      consoleError(err, 'Failed to fetch daemon profile')
      setDaemonProfile(null)
    }
  }, [])

  // Load profile when daemon connects
  useEffect(() => {
    if (daemonConnected) {
      refreshDaemonProfile()
    }
  }, [daemonConnected, refreshDaemonProfile])

  const deriveIdentity = useCallback(
    (mnemonic: string) => {
      if (!initialized) return

      try {
        const seed = bip39.mnemonicToSeedSync(mnemonic)
        const result = derive_identity_keypair_from_seed(seed, 0)
        if (result) {
          setIdentity({
            pubkey_hex: result.pubkey_hex,
            secret_key_hex: result.secret_key_hex,
          })
        }
      } catch (err) {
        consoleError(err, 'Failed to derive SatsPath identity')
      }
    },
    [initialized],
  )

  const resolveAndQuote = useCallback(
    async (alias: string, amountSats: number): Promise<ResolvedQuote> => {
      // Prefer daemon API when connected
      if (daemonConnected) {
        try {
          // Use public GET /v2/resolve (no auth needed)
          const envelope: any = await daemonFetch(
            `/v2/resolve?identifier=${encodeURIComponent(alias)}`,
          )
          const profile = envelope.signed_profile?.profile
          if (!profile || !profile.methods?.length) {
            return { status: 'no_route', error: 'No payment methods found' }
          }

          // Pick best rail: prefer Lightning for small amounts, then Ark, then Onchain
          const methods = profile.methods as Array<{ type: string; lightning_address?: string; address?: string; server?: string; pubkey?: string }>
          const pick = methods.find((m) => m.type === 'Lightning')
            || methods.find((m) => m.type === 'Ark')
            || methods.find((m) => m.type === 'Onchain')

          if (!pick) return { status: 'no_route', error: 'No usable rail' }

          let qr = ''
          const railType = pick.type as SatsPathRail
          if (railType === 'Lightning' && pick.lightning_address) {
            qr = pick.lightning_address
          } else if (railType === 'Onchain' && pick.address) {
            qr = `bitcoin:${pick.address}?amount=${(amountSats / 1e8).toFixed(8)}`
          } else if (railType === 'Ark' && pick.server && pick.pubkey) {
            qr = `ark:${pick.pubkey}?server=${encodeURIComponent(pick.server)}&amount=${amountSats}`
          } else {
            return { status: 'no_route', error: 'Could not build payment URI' }
          }

          const quote: SatsPathQuoteResponse = {
            status: 'ok',
            selected_method: { type: railType },
            available_methods: methods.map((m) => ({
              type: m.type as SatsPathRail,
              lightning_address: m.lightning_address,
              address: m.address,
              server: m.server,
              pubkey: m.pubkey,
            })),
            qr,
            fee_sats: 0,
            recipient: { alias: profile.alias || alias },
          }
          return { status: 'ok', quote }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          if (msg.includes('not found')) {
            return { status: 'not_registered', error: 'Recipient not registered on SatsPath' }
          }
          consoleError(err, 'SatsPath daemon resolve failed')
          return { status: 'error', error: msg }
        }
      }

      // Fallback to local WASM quote
      if (!initialized) {
        return { status: 'error', error: 'SatsPath not initialized' }
      }

      try {
        const result: any = await satspathQuote(alias, amountSats)
        if (result.status === 'ok') {
          return { status: 'ok', quote: result as SatsPathQuoteResponse }
        }
        return { status: result.status as ResolvedQuote['status'], error: result.status }
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error'
        consoleError(err, 'SatsPath quote failed')
        return { status: 'error', error }
      }
    },
    [initialized, daemonConnected],
  )

  const verifyProfile = useCallback(
    (profileJson: string): boolean => {
      if (!initialized) return false

      try {
        return verify_signed_profile(profileJson)
      } catch (err) {
        consoleError(err, 'SatsPath verify failed')
        return false
      }
    },
    [initialized],
  )

  const registerAlias = useCallback(
    async (alias: string): Promise<{ challengeId: string; message: string }> => {
      const res = await daemonFetch<{ challenge_id: string; message: string }>(
        '/v1/profile/challenge',
        {
          method: 'POST',
          body: JSON.stringify({ alias }),
        },
      )
      return { challengeId: res.challenge_id, message: res.message }
    },
    [],
  )

  const verifyAlias = useCallback(
    async (alias: string, token: string): Promise<SatsPathDaemonProfile> => {
      const res = await daemonFetch<SatsPathDaemonProfile>('/v1/profile/verify', {
        method: 'POST',
        body: JSON.stringify({ alias, token }),
      })
      setDaemonProfile(res)
      return res
    },
    [],
  )

  const updateProfileMethods = useCallback(
    async (methods: {
      lightning_address?: string
      onchain_address?: string
      ark_server?: string
      ark_pubkey?: string
    }): Promise<SatsPathDaemonProfile> => {
      const res = await daemonFetch<SatsPathDaemonProfile>('/v1/profile/methods', {
        method: 'POST',
        body: JSON.stringify(methods),
      })
      setDaemonProfile(res)
      return res
    },
    [],
  )

  return (
    <SatsPathContext.Provider
      value={{
        initialized,
        identity,
        daemonUrl: SATSPATH_URL,
        daemonConnected,
        daemonProfile,
        daemonStatus,
        deriveIdentity,
        resolveAndQuote,
        verifyProfile,
        checkDaemonHealth,
        registerAlias,
        verifyAlias,
        updateProfileMethods,
        refreshDaemonProfile,
      }}
    >
      {children}
    </SatsPathContext.Provider>
  )
}
