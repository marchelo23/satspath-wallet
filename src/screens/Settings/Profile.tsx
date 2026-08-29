import { useContext, useEffect, useState } from 'react'
import Button from '../../components/Button'
import Content from '../../components/Content'
import Padded from '../../components/Padded'
import Header from './Header'
import FlexCol from '../../components/FlexCol'
import FlexRow from '../../components/FlexRow'
import Input from '../../components/Input'
import { TextSecondary } from '../../components/Text'
import ErrorMessage from '../../components/Error'
import { WalletContext } from '../../providers/wallet'
import { AspContext } from '../../providers/asp'
import { getPrivateKey } from '../../lib/privateKey'
import {
  createSignedProfileFromWallet,
  encodeSignedProfileForUri,
  loadSatsPathIdentitySettings,
  saveSatsPathIdentitySettings,
  DEFAULT_PROFILE_TTL_SECONDS,
  type SatsPathIdentitySettings,
} from '../../lib/satspath'
import { SignedPaymentProfile, BitcoinNetwork } from '@satspath/resolvers'
import SatsPathIdentityCard from '../../components/SatsPathIdentityCard'
import { copyToClipboard } from '../../lib/clipboard'
import { toast } from '../../components/Toast'

const VALID_NETWORKS: BitcoinNetwork[] = ['mainnet', 'testnet', 'regtest']

function toBitcoinNetwork(network: string): BitcoinNetwork {
  return (VALID_NETWORKS as string[]).includes(network) ? (network as BitcoinNetwork) : 'mainnet'
}

export default function Profile() {
  const { svcWallet } = useContext(WalletContext)
  const { aspInfo } = useContext(AspContext)

  const [settings, setSettings] = useState<SatsPathIdentitySettings>({ alias: '' })
  const [password, setPassword] = useState('')
  const [signedProfile, setSignedProfile] = useState<SignedPaymentProfile | null>(null)
  const [rawProfile, setRawProfile] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setSettings(loadSatsPathIdentitySettings())
  }, [])

  const update = (patch: Partial<SatsPathIdentitySettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
    setSaved(false)
  }

  const handleSave = () => {
    saveSatsPathIdentitySettings(settings)
    setSaved(true)
    toast('SatsPath identity saved')
  }

  const handleSign = async () => {
    setError('')
    setBusy(true)
    try {
      if (!svcWallet) throw new Error('Wallet not ready')
      if (!password) throw new Error('Enter your password to sign your profile')
      const privateKey = await getPrivateKey(password)
      const [arkAddress, onchainAddress] = await Promise.all([svcWallet.getAddress(), svcWallet.getBoardingAddress()])
      if (!arkAddress) throw new Error('Unable to get Ark address')
      if (!onchainAddress) throw new Error('Unable to get on-chain address')

      const signed = createSignedProfileFromWallet({
        alias: settings.alias || 'My SatsPath',
        privateKey,
        arkAddress,
        arkServer: aspInfo.url,
        onchainAddress,
        lightningAddress: settings.lightningAddress,
        lightningLnurl: settings.lightningLnurl,
        network: toBitcoinNetwork(aspInfo.network),
      })
      const raw = JSON.stringify(signed)
      setSignedProfile(signed)
      setRawProfile(raw)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleCopyUri = async () => {
    if (!rawProfile) return
    await copyToClipboard(encodeSignedProfileForUri(JSON.parse(rawProfile)))
    toast('Profile URI copied')
  }

  return (
    <>
      <Header text='SatsPath Profile' back />
      <Content>
        <Padded>
          <FlexCol gap='1.25rem' className='settings-page'>
            <section className='settings-section'>
              <p className='settings-section-label'>Identity</p>
              <FlexCol gap='0.75rem'>
                <Input
                  label='SatsPath alias'
                  name='satspath-alias'
                  placeholder='user@arkade.money'
                  value={settings.alias}
                  onChange={(v) => update({ alias: v })}
                />
                <Input
                  label='Lightning address (optional)'
                  name='satspath-ln-address'
                  placeholder='you@walletofsatoshi.com'
                  value={settings.lightningAddress ?? ''}
                  onChange={(v) => update({ lightningAddress: v })}
                />
                <Input
                  label='LNURL / Lightning URL (optional)'
                  name='satspath-lnurl'
                  placeholder='lnurl1...'
                  value={settings.lightningLnurl ?? ''}
                  onChange={(v) => update({ lightningLnurl: v })}
                />
                <FlexRow gap='0.75rem'>
                  <Button label='Save identity' onClick={handleSave} secondary />
                  {saved ? <TextSecondary small>Saved</TextSecondary> : null}
                </FlexRow>
                <TextSecondary small>
                  Link your alias to a human-readable handle (NIP-05 / BIP-353) by publishing this signed profile to
                  your resolver. Addresses rotate after each receive to preserve privacy.
                </TextSecondary>
              </FlexCol>
            </section>

            <section className='settings-section'>
              <p className='settings-section-label'>Sign &amp; share</p>
              <FlexCol gap='0.75rem'>
                <Input
                  type='text'
                  label='Password'
                  name='satspath-password'
                  placeholder='Wallet password'
                  value={password}
                  onChange={setPassword}
                />
                <Button label={busy ? 'Signing…' : 'Generate signed profile'} onClick={handleSign} disabled={busy} />
                {error ? <ErrorMessage error text={error} /> : null}
                <TextSecondary small>
                  Profiles are signed with your identity key (BIP-340 Schnorr) and expire after{' '}
                  {Math.round(DEFAULT_PROFILE_TTL_SECONDS / 3600)}h.
                </TextSecondary>
              </FlexCol>
            </section>

            {signedProfile ? (
              <section className='settings-section'>
                <p className='settings-section-label'>Your SatsPath card</p>
                <SatsPathIdentityCard
                  profile={signedProfile}
                  rawProfile={rawProfile}
                  onShareProfile={async (raw) => {
                    await copyToClipboard(raw)
                    toast('Profile copied')
                  }}
                />
                <FlexRow gap='0.75rem'>
                  <Button label='Copy profile URI' onClick={handleCopyUri} secondary />
                </FlexRow>
              </section>
            ) : null}
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
