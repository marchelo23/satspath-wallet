import { ReactNode, createContext, useCallback, useEffect, useRef, useState } from 'react'
import init, {
  derive_identity_keypair_from_seed,
  LocalRegistry,
  quote as satspathQuote,
  verify_signed_profile,
  type IdentityKeypair,
} from '@satspath/wasm'
import { mnemonicToSeedSync } from '@scure/bip39'
import { consoleError } from '../lib/logs'

// ─── Daemon config ────────────────────────────────────────────────────────────
const SATSPATH_URL =
  import.meta.env.VITE_SATSPATH_URL ||
  import.meta.env.VITE_SATSPATH_API ||
  'https://satspath-wallet-production-d55f.up.railway.app'
const SATSPATH_AUTH = import.meta.env.VITE_SATSPATH_AUTH_TOKEN || ''

// ─── localStorage keys ────────────────────────────────────────────────────────
const STORAGE_KEY_ALIAS = 'satspath_alias'
const STORAGE_KEY_METHODS = 'satspath_methods'
const STORAGE_KEY_PROFILE_JSON = 'satspath_profile_json'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SatsPathRail = 'Lightning' | 'Ark' | 'Onchain'

/**
 * Operating mode of the SatsPath provider:
 * - 'daemon'   : daemon connected — alias is publicly resolvable by others
 * - 'local'    : no daemon — alias saved locally; user can SEND to aliases but
 *                others cannot find them until daemon reconnects
 * - 'offline'  : WASM not yet initialised or fatal error
 */
export type SatsPathMode = 'daemon' | 'local' | 'offline'

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

export interface SatsPathMethodsPayload {
  lightning_address?: string
  onchain_address?: string
  ark_server?: string
  ark_pubkey?: string
  ark_address?: string
}

// ─── Context shape ────────────────────────────────────────────────────────────

interface SatsPathContextProps {
  initialized: boolean
  identity: SatsPathIdentity | null
  daemonUrl: string
  daemonConnected: boolean
  daemonProfile: SatsPathDaemonProfile | null
  daemonStatus: SatsPathDaemonStatus | null
  /** Current operating mode */
  mode: SatsPathMode
  /** Alias stored locally (persists without daemon) */
  localAlias: string | null
  deriveIdentity: (mnemonic: string) => void
  resolveAndQuote: (alias: string, amountSats: number) => Promise<ResolvedQuote>
  verifyProfile: (profileJson: string) => boolean
  checkDaemonHealth: () => Promise<boolean>
  registerAlias: (alias: string) => Promise<{ challengeId: string; message: string }>
  verifyAlias: (alias: string, token: string) => Promise<SatsPathDaemonProfile>
  /**
   * Update the profile's payment methods.
   * Saves to localStorage immediately, then pushes to daemon if connected.
   */
  updateProfileMethods: (methods: SatsPathMethodsPayload) => Promise<SatsPathDaemonProfile>
  /**
   * Auto-sync the wallet's current receiving addresses into the SatsPath
   * profile (localStorage + daemon). Called automatically after wallet init
   * and when addresses rotate.
   */
  autoSyncMethods: (methods: SatsPathMethodsPayload) => Promise<void>
  /**
   * Persist an alias locally (in localStorage).  When daemon is connected,
   * also kicks off the challenge → verify flow on the daemon.
   */
  persistAlias: (alias: string) => void
  refreshDaemonProfile: () => Promise<void>
}

// ─── Context defaults ─────────────────────────────────────────────────────────

export const SatsPathContext = createContext<SatsPathContextProps>({
  initialized: false,
  identity: null,
  daemonUrl: SATSPATH_URL,
  daemonConnected: false,
  daemonProfile: null,
  daemonStatus: null,
  mode: 'offline',
  localAlias: null,
  deriveIdentity: () => {},
  resolveAndQuote: async () => ({ status: 'error', error: 'Not initialized' }),
  verifyProfile: () => false,
  checkDaemonHealth: async () => false,
  registerAlias: async () => ({ challengeId: '', message: '' }),
  verifyAlias: async () => ({} as SatsPathDaemonProfile),
  updateProfileMethods: async () => ({} as SatsPathDaemonProfile),
  autoSyncMethods: async () => {},
  persistAlias: () => {},
  refreshDaemonProfile: async () => {},
})

// ─── Daemon HTTP helper ───────────────────────────────────────────────────────

async function daemonFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${SATSPATH_URL}${path}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (SATSPATH_AUTH) headers['Authorization'] = `Bearer ${SATSPATH_AUTH}`
  const res = await fetch(url, { ...options, headers: { ...headers, ...options?.headers } })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`SatsPath daemon error ${res.status}: ${body}`)
  }
  return res.json()
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function readLocalAlias(pubkey?: string | null): string | null {
  try {
    if (pubkey) {
      const scoped = localStorage.getItem(`${STORAGE_KEY_ALIAS}_${pubkey}`)
      if (scoped) return scoped
    }
    return localStorage.getItem(STORAGE_KEY_ALIAS)
  } catch {
    return null
  }
}

function writeLocalAlias(alias: string, pubkey?: string | null): void {
  try {
    if (pubkey) {
      localStorage.setItem(`${STORAGE_KEY_ALIAS}_${pubkey}`, alias)
    }
    localStorage.setItem(STORAGE_KEY_ALIAS, alias)
  } catch {
    // storage might be full or blocked
  }
}

function readLocalMethods(): SatsPathMethodsPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_METHODS)
    return raw ? (JSON.parse(raw) as SatsPathMethodsPayload) : null
  } catch {
    return null
  }
}

function writeLocalMethods(methods: SatsPathMethodsPayload): void {
  try {
    localStorage.setItem(STORAGE_KEY_METHODS, JSON.stringify(methods))
  } catch {}
}

function readLocalProfileJson(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_PROFILE_JSON)
  } catch {
    return null
  }
}

function writeLocalProfileJson(json: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_PROFILE_JSON, json)
  } catch {}
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export const SatsPathProvider = ({ children }: { children: ReactNode }) => {
  const [initialized, setInitialized] = useState(false)
  const [identity, setIdentity] = useState<SatsPathIdentity | null>(null)
  const [daemonConnected, setDaemonConnected] = useState(false)
  const [daemonProfile, setDaemonProfile] = useState<SatsPathDaemonProfile | null>(null)
  const [daemonStatus, setDaemonStatus] = useState<SatsPathDaemonStatus | null>(null)
  const [localAlias, setLocalAlias] = useState<string | null>(readLocalAlias)
  // WASM-side local registry for offline resolution
  const localRegistry = useRef<LocalRegistry | null>(null)
  const initRef = useRef(false)
  // Track whether we were disconnected so we can detect reconnection
  const prevConnected = useRef(false)

  // ── Derived mode ──────────────────────────────────────────────────────────
  const mode: SatsPathMode = !initialized ? 'offline' : daemonConnected ? 'daemon' : 'local'

  // ── WASM init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
    init(`${base}/satspath_wasm_bg.wasm`)
      .then(() => {
        setInitialized(true)
        localRegistry.current = new LocalRegistry()

        // Pre-load any locally-cached signed profile into WASM registry
        const cachedJson = readLocalProfileJson()
        if (cachedJson && localRegistry.current) {
          try {
            localRegistry.current.add_profile(cachedJson)
          } catch {
            // stale or malformed cache — ignore
          }
        }
      })
      .catch((err) => {
        consoleError(err, 'Failed to initialize SatsPath WASM')
        initRef.current = false
      })
  }, [])

  // ── Auto-sync local state to daemon on reconnection ───────────────────────
  const refreshDaemonProfile = useCallback(async () => {
    try {
      const pubkey = identity?.pubkey_hex
      const local = readLocalAlias(pubkey)
      let path = '/v1/profile'
      if (pubkey) {
        path += `?pubkey=${encodeURIComponent(pubkey)}`
        if (local) path += `&alias=${encodeURIComponent(local)}`
      } else if (local) {
        path += `?alias=${encodeURIComponent(local)}`
      }
      const profile = await daemonFetch<SatsPathDaemonProfile>(path)
      if (
        pubkey &&
        profile?.wallet?.identity_pubkey &&
        profile.wallet.identity_pubkey !== pubkey
      ) {
        setDaemonProfile(null)
      } else if (profile?.wallet?.alias) {
        setDaemonProfile(profile)
      } else {
        setDaemonProfile(null)
      }
    } catch (err) {
      consoleError(err, 'Failed to fetch daemon profile')
      setDaemonProfile(null)
    }
  }, [identity?.pubkey_hex])

  useEffect(() => {
    if (identity?.pubkey_hex) {
      setLocalAlias(readLocalAlias(identity.pubkey_hex))
      refreshDaemonProfile()
    }
  }, [identity?.pubkey_hex, refreshDaemonProfile])

  // ── Daemon health check (every 30 s) ─────────────────────────────────────
  const checkDaemonHealth = useCallback(async (): Promise<boolean> => {
    try {
      const res = await daemonFetch<SatsPathDaemonStatus>('/v1/status')
      setDaemonConnected(true)
      setDaemonStatus(res)
      refreshDaemonProfile()
      return true
    } catch {
      setDaemonConnected(false)
      setDaemonStatus(null)
      return false
    }
  }, [refreshDaemonProfile])

  useEffect(() => {
    checkDaemonHealth()
    const interval = setInterval(checkDaemonHealth, 30_000)
    return () => clearInterval(interval)
  }, [checkDaemonHealth])

  useEffect(() => {
    if (!daemonConnected) {
      prevConnected.current = false
      return
    }

    // Always refresh profile when daemon is connected
    refreshDaemonProfile()

    // If this is a reconnection (was offline before), push local data to daemon
    if (!prevConnected.current) {
      const alias = readLocalAlias()
      const methods = readLocalMethods()

      if (alias && methods) {
        // Push methods to daemon silently — alias must already be verified on
        // the daemon side (or it will reject). We don't want to re-do the
        // challenge/verify flow automatically.
        daemonFetch<SatsPathDaemonProfile>('/v1/profile/methods', {
          method: 'POST',
          body: JSON.stringify(methods),
        })
          .then((profile) => setDaemonProfile(profile))
          .catch((err) => consoleError(err, 'Auto-sync to daemon on reconnect failed'))
      }
    }

    prevConnected.current = true
  }, [daemonConnected, refreshDaemonProfile])

  const pendingMnemonicRef = useRef<string | null>(null)

  // ── Identity derivation ───────────────────────────────────────────────────
  const deriveIdentity = useCallback(
    (mnemonic: string) => {
      if (!initialized) {
        pendingMnemonicRef.current = mnemonic
        return
      }
      try {
        const seed = mnemonicToSeedSync(mnemonic)
        const result = derive_identity_keypair_from_seed(seed, 0)
        if (result) {
          setIdentity({
            pubkey_hex: result.pubkey_hex,
            secret_key_hex: result.secret_key_hex,
          })
          pendingMnemonicRef.current = null
        }
      } catch (err) {
        consoleError(err, 'Failed to derive SatsPath identity')
      }
    },
    [initialized],
  )

  useEffect(() => {
    if (initialized && pendingMnemonicRef.current) {
      deriveIdentity(pendingMnemonicRef.current)
    }
  }, [initialized, deriveIdentity])

  // ── Resolve and quote ─────────────────────────────────────────────────────
  const resolveAndQuote = useCallback(
    async (alias: string, amountSats: number): Promise<ResolvedQuote> => {
      // 1. Prefer daemon API when connected (/v2/resolve — public, no auth)
      if (daemonConnected) {
        try {
          const envelope: any = await daemonFetch(
            `/v2/resolve?identifier=${encodeURIComponent(alias)}`,
          )
          const profile = envelope.signed_profile?.profile
          if (!profile || !profile.methods?.length) {
            return { status: 'no_route', error: 'No payment methods found' }
          }

          const methods = profile.methods as Array<{
            type: string
            lightning_address?: string
            address?: string
            server?: string
            pubkey?: string
            opaque_uri?: string
          }>
          // Prioritize Ark for native Arkade wallet-to-wallet transfers, then Lightning, then Onchain
          const pick =
            methods.find((m) => m.type === 'Ark') ||
            methods.find((m) => m.type === 'Lightning') ||
            methods.find((m) => m.type === 'Onchain')

          if (!pick) return { status: 'no_route', error: 'No usable rail' }

          let qr = ''
          const railType = pick.type as SatsPathRail
          if (railType === 'Lightning' && pick.lightning_address) {
            qr = pick.lightning_address
          } else if (railType === 'Onchain' && pick.address) {
            qr = `bitcoin:${pick.address}?amount=${(amountSats / 1e8).toFixed(8)}`
          } else if (railType === 'Ark') {
            if (pick.opaque_uri) {
              qr = pick.opaque_uri
            } else if (pick.pubkey?.startsWith('tark1') || pick.pubkey?.startsWith('ark1')) {
              qr = pick.pubkey
            } else if (pick.address?.startsWith('tark1') || pick.address?.startsWith('ark1')) {
              qr = pick.address
            } else if (pick.server && pick.pubkey) {
              qr = `ark:${pick.pubkey}?server=${encodeURIComponent(pick.server)}&amount=${amountSats}`
            } else {
              return { status: 'no_route', error: 'Could not build payment URI' }
            }
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
              opaque_uri: m.opaque_uri,
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

      // 2. Fallback: WASM ChainResolver (BIP353 → HTTPS .well-known → Nostr)
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
        consoleError(err, 'SatsPath WASM quote failed')
        return { status: 'error', error }
      }
    },
    [initialized, daemonConnected],
  )

  // ── Profile verification ──────────────────────────────────────────────────
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

  // ── Alias persistence (local-first) ──────────────────────────────────────
  const persistAlias = useCallback(
    (alias: string) => {
      writeLocalAlias(alias, identity?.pubkey_hex)
      setLocalAlias(alias)
    },
    [identity?.pubkey_hex],
  )

  // ── Alias registration (daemon challenge/verify) ──────────────────────────
  const registerAlias = useCallback(
    async (alias: string): Promise<{ challengeId: string; message: string }> => {
      if (!daemonConnected) {
        // No daemon — persist locally and tell UI to skip the challenge step
        persistAlias(alias)
        return {
          challengeId: 'local',
          message:
            'Daemon not available. Alias saved locally. ' +
            'Start satspathd to make your alias publicly resolvable.',
        }
      }

      const res = await daemonFetch<{ challenge_id: string; message: string }>(
        '/v1/profile/challenge',
        {
          method: 'POST',
          body: JSON.stringify({
            alias,
            identity_pubkey: identity?.pubkey_hex || undefined,
          }),
        },
      )
      return { challengeId: res.challenge_id, message: res.message }
    },
    [daemonConnected, identity?.pubkey_hex, persistAlias],
  )

  // ── Alias verification ────────────────────────────────────────────────────
  const verifyAlias = useCallback(
    async (alias: string, token: string): Promise<SatsPathDaemonProfile> => {
      if (!daemonConnected) {
        // Offline: save locally
        persistAlias(alias)
        const localProfile: SatsPathDaemonProfile = {
          wallet: { alias, identity_pubkey: identity?.pubkey_hex },
        }
        setDaemonProfile(localProfile)
        return localProfile
      }

      const res = await daemonFetch<SatsPathDaemonProfile>('/v1/profile/verify', {
        method: 'POST',
        body: JSON.stringify({
          alias,
          token,
          identity_pubkey: identity?.pubkey_hex || undefined,
        }),
      })
      persistAlias(alias)
      setDaemonProfile(res)
      return res
    },
    [daemonConnected, identity?.pubkey_hex, persistAlias],
  )

  // ── Update payment methods (localStorage + daemon) ────────────────────────
  const updateProfileMethods = useCallback(
    async (methods: SatsPathMethodsPayload): Promise<SatsPathDaemonProfile> => {
      // Always persist locally first
      writeLocalMethods(methods)

      const alias = readLocalAlias(identity?.pubkey_hex)

      if (!daemonConnected) {
        const local: SatsPathDaemonProfile = {
          wallet: {
            alias: alias ?? undefined,
            identity_pubkey: identity?.pubkey_hex,
            lightning_address: methods.lightning_address,
            onchain_address: methods.onchain_address,
            ark_server: methods.ark_server,
          },
        }
        setDaemonProfile(local)
        return local
      }

      const res = await daemonFetch<SatsPathDaemonProfile>('/v1/profile/methods', {
        method: 'POST',
        body: JSON.stringify({
          ...methods,
          alias: alias || undefined,
          identity_pubkey: identity?.pubkey_hex || undefined,
        }),
      })
      setDaemonProfile(res)
      return res
    },
    [daemonConnected, identity?.pubkey_hex],
  )

  // ── Auto-sync methods (called by wallet provider when addresses change) ────
  const autoSyncMethods = useCallback(
    async (methods: SatsPathMethodsPayload): Promise<void> => {
      // Only sync if there's something meaningful to publish
      const hasMethod =
        methods.lightning_address ||
        methods.onchain_address ||
        methods.ark_server ||
        methods.ark_address

      if (!hasMethod) return

      // Save locally regardless of daemon state
      writeLocalMethods(methods)

      // Push to daemon if connected AND we have a verified alias
      const alias = readLocalAlias(identity?.pubkey_hex)
      if (!daemonConnected || !alias) return

      try {
        const res = await daemonFetch<SatsPathDaemonProfile>('/v1/profile/methods', {
          method: 'POST',
          body: JSON.stringify({
            ...methods,
            alias: alias || undefined,
            identity_pubkey: identity?.pubkey_hex || undefined,
          }),
        })
        setDaemonProfile(res)
      } catch (err) {
        // Non-fatal — local copy is the source of truth
        consoleError(err, 'autoSyncMethods: daemon push failed')
      }
    },
    [daemonConnected, identity?.pubkey_hex],
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
        mode,
        localAlias,
        deriveIdentity,
        resolveAndQuote,
        verifyProfile,
        checkDaemonHealth,
        registerAlias,
        verifyAlias,
        updateProfileMethods,
        autoSyncMethods,
        persistAlias,
        refreshDaemonProfile,
      }}
    >
      {children}
    </SatsPathContext.Provider>
  )
}
