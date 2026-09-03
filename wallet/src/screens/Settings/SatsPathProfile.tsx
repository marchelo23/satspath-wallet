import { useContext, useEffect, useState } from 'react'
import Button from '../../components/Button'
import Header from '../../components/Header'
import Content from '../../components/Content'
import Padded from '../../components/Padded'
import FlexCol from '../../components/FlexCol'
import FlexRow from '../../components/FlexRow'
import Text from '../../components/Text'
import Shadow from '../../components/Shadow'
import LoadingLogo from '../../components/LoadingLogo'
import { SatsPathContext } from '../../providers/satspath'
import { WalletContext } from '../../providers/wallet'
import { ConfigContext } from '../../providers/config'
import { AspContext } from '../../providers/asp'
import { copyToClipboard } from '../../lib/clipboard'
import { useToast } from '../../components/Toast'
import { extractError } from '../../lib/error'
import { consoleError } from '../../lib/logs'
import { getReceivingAddresses } from '../../lib/asp'
import { isMainnet } from '../../lib/constants'

const monoStyle = { fontFamily: 'monospace', wordBreak: 'break-all' as const }

/** Colour + label for each SatsPath operating mode */
function ModeIndicator({ mode }: { mode: 'daemon' | 'local' | 'offline' }) {
  const map = {
    daemon: { color: '#22c55e', label: '● Daemon connected — profile is publicly resolvable' },
    local: { color: '#f59e0b', label: '● Local only — others cannot find you until daemon starts' },
    offline: { color: '#ef4444', label: '● Offline — SatsPath not available' },
  } as const

  const { color, label } = map[mode]
  return (
    <span style={{ fontSize: '0.75rem', color }}>
      {label}
    </span>
  )
}

export default function SatsPathProfile() {
  const {
    initialized,
    identity,
    daemonConnected,
    daemonProfile,
    daemonStatus,
    mode,
    localAlias,
    registerAlias,
    verifyAlias,
    updateProfileMethods,
    autoSyncMethods,
    persistAlias,
    refreshDaemonProfile,
  } = useContext(SatsPathContext)
  const { config, updateConfig } = useContext(ConfigContext)
  const { aspInfo } = useContext(AspContext)
  const { svcWallet } = useContext(WalletContext)
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [addresses, setAddresses] = useState<{ boardingAddr: string; offchainAddr: string } | null>(null)
  const [aliasInput, setAliasInput] = useState('')
  const [challengeToken, setChallengeToken] = useState('')
  const [challengeMessage, setChallengeMessage] = useState('')
  const [registrationStep, setRegistrationStep] = useState<'idle' | 'challenge' | 'verify' | 'done'>('idle')

  // The active alias — prefer daemon profile, fall back to local storage
  const activeAlias = daemonProfile?.wallet?.alias || localAlias

  // Load receiving addresses (boarding + offchain)
  useEffect(() => {
    if (!svcWallet) return
    getReceivingAddresses(svcWallet)
      .then(({ boardingAddr, offchainAddr }) => {
        if (boardingAddr && offchainAddr) {
          setAddresses({ boardingAddr, offchainAddr })
        }
      })
      .catch((err) => consoleError(err, 'Failed to get receiving addresses'))
  }, [svcWallet])

  // Pre-fill alias input from config or localStorage
  useEffect(() => {
    if (activeAlias && !aliasInput) {
      setAliasInput(activeAlias)
    }
  }, [activeAlias])

  // ── Registration flow ──────────────────────────────────────────────────────

  const handleCreateChallenge = async () => {
    if (!aliasInput) return toast('Enter an alias first')
    if (!aliasInput.includes('@')) return toast('Invalid alias format — use user@domain.com')

    setLoading(true)
    try {
      const result = await registerAlias(aliasInput)

      // Daemon offline path: alias was saved locally, skip challenge
      if (result.challengeId === 'local') {
        // Also persist in wallet config
        updateConfig({ ...config, satspathAlias: aliasInput })
        toast('Alias saved locally. Start satspathd to publish it publicly.')
        setRegistrationStep('done')
        return
      }

      setChallengeMessage(result.message)
      setRegistrationStep('challenge')
      toast('Verification code sent')
    } catch (err) {
      toast(`Challenge failed: ${extractError(err)}`)
      consoleError(err, 'Failed to create challenge')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    if (!aliasInput || !challengeToken) return toast('Enter the verification token')
    setLoading(true)
    try {
      await verifyAlias(aliasInput, challengeToken)
      // Save to wallet config for persistence
      updateConfig({ ...config, satspathAlias: aliasInput })
      toast('Alias verified!')
      await refreshDaemonProfile()
      setRegistrationStep('done')
    } catch (err) {
      toast(`Verification failed: ${extractError(err)}`)
      consoleError(err, 'Failed to verify alias')
    } finally {
      setLoading(false)
    }
  }

  const handlePublishMethods = async () => {
    if (!addresses) return toast('Addresses not ready yet')
    setLoading(true)
    try {
      await updateProfileMethods({
        lightning_address: activeAlias || aliasInput || undefined,
        onchain_address: addresses.boardingAddr,
        ark_server: aspInfo.url || undefined,
        ark_pubkey: aspInfo.signerPubkey || undefined,
        ark_address: addresses.offchainAddr,
      })
      toast('Profile published!')
      await refreshDaemonProfile()
    } catch (err) {
      toast(`Publish failed: ${extractError(err)}`)
      consoleError(err, 'Failed to publish methods')
    } finally {
      setLoading(false)
    }
  }

  /** Force-push current addresses to daemon (manual refresh) */
  const handleForceSync = async () => {
    if (!addresses) return toast('Addresses not loaded yet')
    setLoading(true)
    try {
      await autoSyncMethods({
        lightning_address: activeAlias || undefined,
        onchain_address: addresses.boardingAddr,
        ark_server: aspInfo.url || undefined,
        ark_pubkey: aspInfo.signerPubkey || undefined,
        ark_address: addresses.offchainAddr,
      })
      await refreshDaemonProfile()
      toast('Synced!')
    } catch (err) {
      toast(`Sync failed: ${extractError(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async (text: string, label: string) => {
    await copyToClipboard(text)
    toast(`${label} copied`)
  }

  if (!initialized) {
    return (
      <>
        <Header text='SatsPath Profile' back />
        <Content>
          <LoadingLogo text='Initializing SatsPath…' />
        </Content>
      </>
    )
  }

  return (
    <>
      <Header text='SatsPath Profile' back />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>

            {/* ── Mode + Daemon Status ───────────────────────────────────────── */}
            <Shadow>
              <FlexCol gap='0.75rem' padding='1rem'>
                <FlexRow between>
                  <Text bold>SatsPath Status</Text>
                  {daemonConnected && (
                    <Button secondary onClick={handleForceSync} disabled={loading}>
                      ↺ Sync
                    </Button>
                  )}
                </FlexRow>

                <ModeIndicator mode={mode} />

                {daemonStatus && (
                  <Text small color='neutral-500'>
                    {daemonStatus.daemon} v{daemonStatus.version} · {daemonStatus.bind} · {daemonStatus.network}
                  </Text>
                )}
              </FlexCol>
            </Shadow>

            {/* ── Identity ──────────────────────────────────────────────────── */}
            <Shadow>
              <FlexCol gap='0.75rem' padding='1rem'>
                <Text bold>Identity</Text>
                <Text color='neutral-500' small>
                  Derived from wallet seed at m/9737'/0' (secp256k1 Schnorr)
                </Text>

                {identity ? (
                  <FlexCol gap='0.25rem'>
                    <FlexRow between>
                      <Text small>Public Key</Text>
                      <Button copy onClick={() => handleCopy(identity.pubkey_hex, 'Public key')}>
                        Copy
                      </Button>
                    </FlexRow>
                    <p style={monoStyle}>
                      <Text small>{identity.pubkey_hex}</Text>
                    </p>
                  </FlexCol>
                ) : (
                  <Text color='neutral-500' small>
                    No identity derived yet — unlock your wallet first
                  </Text>
                )}
              </FlexCol>
            </Shadow>

            {/* ── 3 Payment Rails ───────────────────────────────────────────── */}
            {addresses && (
              <Shadow>
                <FlexCol gap='0.75rem' padding='1rem'>
                  <Text bold>Payment Rails</Text>
                  <Text color='neutral-500' small>
                    Your 3 addresses that SatsPath publishes to the network
                  </Text>

                  {/* Lightning / LNURL (uses your alias as a Lightning address) */}
                  <FlexCol gap='0.25rem'>
                    <Text small color='neutral-500'>⚡ Lightning (alias as Lightning address)</Text>
                    <p style={monoStyle}>
                      <Text small>{activeAlias || '—'}</Text>
                    </p>
                  </FlexCol>

                  {/* Ark off-chain address */}
                  <FlexCol gap='0.25rem'>
                    <FlexRow between>
                      <Text small color='neutral-500'>🏹 Ark (off-chain)</Text>
                      <Button copy secondary onClick={() => handleCopy(addresses.offchainAddr, 'Ark address')}>
                        Copy
                      </Button>
                    </FlexRow>
                    <p style={monoStyle}>
                      <Text small>{addresses.offchainAddr}</Text>
                    </p>
                  </FlexCol>

                  {/* On-chain boarding address */}
                  <FlexCol gap='0.25rem'>
                    <FlexRow between>
                      <Text small color='neutral-500'>⛓️ On-chain (Bitcoin)</Text>
                      <Button copy secondary onClick={() => handleCopy(addresses.boardingAddr, 'On-chain address')}>
                        Copy
                      </Button>
                    </FlexRow>
                    <p style={monoStyle}>
                      <Text small>{addresses.boardingAddr}</Text>
                    </p>
                  </FlexCol>

                  {aspInfo.url && (
                    <FlexCol gap='0.25rem'>
                      <Text small color='neutral-500'>ASP Server</Text>
                      <Text small>{aspInfo.url}</Text>
                    </FlexCol>
                  )}
                </FlexCol>
              </Shadow>
            )}

            {/* ── Alias Registration ────────────────────────────────────────── */}
            {!activeAlias && (
              <Shadow>
                <FlexCol gap='1rem' padding='1rem'>
                  <Text bold>Register Your Alias</Text>
                  <Text color='neutral-500' small>
                    Claim a human-readable Bitcoin address like{' '}
                    <em>you@example.com</em> — SatsPath will route payers to
                    the cheapest rail automatically.
                  </Text>

                  {mode !== 'daemon' && (
                    <span style={{ fontSize: '0.75rem', color: '#f59e0b' }}>
                      ⚠️ Daemon is offline. Your alias will be saved locally and
                      published when satspathd starts.
                    </span>
                  )}

                  {registrationStep === 'idle' && (
                    <>
                      <input
                        type='text'
                        value={aliasInput}
                        onChange={(e) => setAliasInput(e.target.value)}
                        placeholder='you@example.com'
                        style={{
                          padding: '0.75rem',
                          borderRadius: '0.5rem',
                          border: '1px solid #333',
                          background: '#1a1a1a',
                          color: '#fff',
                          fontFamily: 'monospace',
                          width: '100%',
                          boxSizing: 'border-box',
                        }}
                      />
                      <Button
                        label='Start Registration'
                        onClick={handleCreateChallenge}
                        disabled={!aliasInput || loading}
                      />
                    </>
                  )}

                  {registrationStep === 'challenge' && (
                    <>
                      <Text color='neutral-500' small>
                        {challengeMessage}
                      </Text>
                      <Text small color='neutral-500'>
                        (Mock mode: paste your email address as the token)
                      </Text>
                      <input
                        type='text'
                        value={challengeToken}
                        onChange={(e) => setChallengeToken(e.target.value)}
                        placeholder='Paste verification token'
                        style={{
                          padding: '0.75rem',
                          borderRadius: '0.5rem',
                          border: '1px solid #333',
                          background: '#1a1a1a',
                          color: '#fff',
                          fontFamily: 'monospace',
                          width: '100%',
                          boxSizing: 'border-box',
                        }}
                      />
                      <Button
                        label='Verify Alias'
                        onClick={handleVerify}
                        disabled={!challengeToken || loading}
                      />
                    </>
                  )}

                  {registrationStep === 'done' && !activeAlias && (
                    <Text color='green' small>
                      ✓ Alias saved. Publish your payment methods below.
                    </Text>
                  )}
                </FlexCol>
              </Shadow>
            )}

            {/* ── Publish / Update Methods ──────────────────────────────────── */}
            {(activeAlias || registrationStep === 'done') && addresses && (
              <Shadow>
                <FlexCol gap='0.75rem' padding='1rem'>
                  <FlexRow between>
                    <Text bold>Published Profile</Text>
                    {daemonProfile?.signature_valid !== undefined && (
                      <Text color={daemonProfile.signature_valid ? 'green' : 'red'} small>
                        {daemonProfile.signature_valid ? '✓ Signature valid' : '✗ Invalid signature'}
                      </Text>
                    )}
                  </FlexRow>

                  {activeAlias && (
                    <FlexRow between>
                    <Text small>Alias</Text>
                    <span style={monoStyle}>
                      <Text small>{activeAlias}</Text>
                    </span>
                  </FlexRow>
                  )}

                  <Button
                    label='Publish / Update Methods'
                    onClick={handlePublishMethods}
                    disabled={loading || !addresses}
                  />
                  <Text color='neutral-500' smaller>
                    This publishes your Lightning, Ark, and On-chain addresses
                    so that anyone using SatsPath can pay you.
                  </Text>
                </FlexCol>
              </Shadow>
            )}

          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
