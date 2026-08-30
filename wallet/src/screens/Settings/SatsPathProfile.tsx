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
import ButtonsOnBottom from '../../components/ButtonsOnBottom'

const monoStyle = { fontFamily: 'monospace', wordBreak: 'break-all' as const }

export default function SatsPathProfile() {
  const {
    initialized,
    identity,
    daemonConnected,
    daemonProfile,
    daemonStatus,
    registerAlias,
    verifyAlias,
    updateProfileMethods,
    refreshDaemonProfile,
  } = useContext(SatsPathContext)
  const { config } = useContext(ConfigContext)
  const { aspInfo } = useContext(AspContext)
  const { svcWallet } = useContext(WalletContext)
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [addresses, setAddresses] = useState<{ boardingAddr: string; offchainAddr: string } | null>(
    null,
  )
  const [aliasInput, setAliasInput] = useState('')
  const [challengeToken, setChallengeToken] = useState('')
  const [challengeMessage, setChallengeMessage] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [registrationStep, setRegistrationStep] = useState<
    'idle' | 'challenge' | 'verify' | 'methods'
  >('idle')

  const registeredAlias = daemonProfile?.wallet?.alias

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

  const handleCreateChallenge = async () => {
    if (!aliasInput) {
      toast('Enter an alias first')
      return
    }
    if (!aliasInput.includes('@')) {
      toast('Invalid alias format (user@domain)')
      return
    }
    setLoading(true)
    try {
      const result = await registerAlias(aliasInput)
      setChallengeId(result.challengeId)
      setChallengeMessage(result.message)
      setRegistrationStep('challenge')
      toast('Verification code sent')
    } catch (err) {
      const msg = extractError(err)
      consoleError(err, 'Failed to create challenge')
      toast(`Challenge failed: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    if (!aliasInput || !challengeToken) {
      toast('Enter the verification token')
      return
    }
    setLoading(true)
    try {
      await verifyAlias(aliasInput, challengeToken)
      setRegistrationStep('methods')
      toast('Alias verified!')
      await refreshDaemonProfile()
    } catch (err) {
      const msg = extractError(err)
      consoleError(err, 'Failed to verify alias')
      toast(`Verification failed: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  const handlePublishMethods = async () => {
    if (!addresses) {
      toast('Addresses not ready')
      return
    }
    setLoading(true)
    try {
      await updateProfileMethods({
        lightning_address: registeredAlias || aliasInput,
        onchain_address: addresses.boardingAddr,
      })
      setRegistrationStep('idle')
      toast('Profile published!')
      await refreshDaemonProfile()
    } catch (err) {
      const msg = extractError(err)
      consoleError(err, 'Failed to publish methods')
      toast(`Publish failed: ${msg}`)
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
          <LoadingLogo text='Initializing SatsPath...' />
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
            {/* Daemon Status */}
            <Shadow>
              <FlexCol gap='1rem' padding='1rem'>
                <FlexRow between>
                  <Text bold>Daemon</Text>
                  <Text color={daemonConnected ? 'green' : 'red'} small>
                    {daemonConnected ? 'Connected' : 'Disconnected'}
                  </Text>
                </FlexRow>
                {daemonStatus && (
                  <FlexCol gap='0.5rem'>
                    <Text small color='neutral-500'>
                      {daemonStatus.daemon} v{daemonStatus.version} ({daemonStatus.network})
                    </Text>
                    <Text small color='neutral-500'>
                      {daemonStatus.bind}
                    </Text>
                  </FlexCol>
                )}
                {daemonStatus?.alias && (
                  <FlexCol gap='0.5rem'>
                    <Text small>Registered as:</Text>
                    <p style={monoStyle}>
                      <Text small>{daemonStatus.alias}</Text>
                    </p>
                  </FlexCol>
                )}
              </FlexCol>
            </Shadow>

            {/* Identity Section */}
            <Shadow>
              <FlexCol gap='1rem' padding='1rem'>
                <Text bold>Identity</Text>
                <Text color='neutral-500' small>
                  Derived from wallet seed at m/9737'/0'
                </Text>

                {identity ? (
                  <FlexCol gap='0.5rem'>
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
                    No identity derived yet
                  </Text>
                )}
              </FlexCol>
            </Shadow>

            {/* Registration Section */}
            {!registeredAlias && (
              <Shadow>
                <FlexCol gap='1rem' padding='1rem'>
                  <Text bold>Register Alias</Text>
                  <Text color='neutral-500' small>
                    Claim your human-readable Bitcoin address
                  </Text>

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
                        }}
                      />
                      <Button
                        label='Verify Alias'
                        onClick={handleVerify}
                        disabled={!challengeToken || loading}
                      />
                    </>
                  )}

                  {registrationStep === 'methods' && addresses && (
                    <>
                      <Text color='green' small>
                        Alias verified! Now publish your payment methods.
                      </Text>
                      <Text small>Lightning: {registeredAlias || aliasInput}</Text>
                      <Text small>On-chain: {addresses.boardingAddr}</Text>
                      <Button
                        label='Publish Profile'
                        onClick={handlePublishMethods}
                        disabled={loading}
                      />
                    </>
                  )}
                </FlexCol>
              </Shadow>
            )}

            {/* Published Profile */}
            {daemonProfile && (
              <Shadow>
                <FlexCol gap='1rem' padding='1rem'>
                  <Text bold>Published Profile</Text>
                  {daemonProfile.wallet.alias && (
                    <Text small>Alias: {daemonProfile.wallet.alias}</Text>
                  )}
                  {daemonProfile.wallet.lightning_address && (
                    <Text small>Lightning: {daemonProfile.wallet.lightning_address}</Text>
                  )}
                  {daemonProfile.wallet.onchain_address && (
                    <Text small>On-chain: {daemonProfile.wallet.onchain_address}</Text>
                  )}
                  {daemonProfile.signature_valid !== undefined && (
                    <Text color={daemonProfile.signature_valid ? 'green' : 'red'} small>
                      Signature: {daemonProfile.signature_valid ? 'Valid' : 'Invalid'}
                    </Text>
                  )}
                </FlexCol>
              </Shadow>
            )}

            {/* Addresses Section */}
            {addresses && (
              <Shadow>
                <FlexCol gap='1rem' padding='1rem'>
                  <Text bold>Local Wallet Addresses</Text>

                  <FlexCol gap='0.5rem'>
                    <FlexRow between>
                      <Text small color='neutral-500'>
                        Arkade Address (Off-chain)
                      </Text>
                      <Button
                        copy
                        secondary
                        onClick={() => handleCopy(addresses.offchainAddr, 'Off-chain address')}
                      >
                        Copy
                      </Button>
                    </FlexRow>
                    <p style={monoStyle}>
                      <Text small>{addresses.offchainAddr}</Text>
                    </p>
                  </FlexCol>

                  <FlexCol gap='0.5rem'>
                    <FlexRow between>
                      <Text small color='neutral-500'>
                        Bitcoin Address (On-chain)
                      </Text>
                      <Button
                        copy
                        secondary
                        onClick={() => handleCopy(addresses.boardingAddr, 'On-chain address')}
                      >
                        Copy
                      </Button>
                    </FlexRow>
                    <p style={monoStyle}>
                      <Text small>{addresses.boardingAddr}</Text>
                    </p>
                  </FlexCol>
                </FlexCol>
              </Shadow>
            )}
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
