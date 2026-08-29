import React from 'react'
import { SignedPaymentProfile } from '@satspath/resolvers'
import { ShieldCheck, Zap, Layers, Globe, Share2, Copy } from 'lucide-react'
import { canBrowserShareData, shareData } from '../lib/share'
import { copyToClipboard } from '../lib/clipboard'
import { toast } from './Toast'

interface SatsPathIdentityCardProps {
  profile: SignedPaymentProfile
  /** Raw JSON of the signed profile, used for copy/share fallback. */
  rawProfile?: string
  onShareProfile?: (rawProfile: string) => void
}

const RAIL_META: Record<'Ark' | 'Lightning' | 'Onchain', { icon: React.ReactNode; label: string; className: string }> =
  {
    Ark: {
      icon: <Layers className='w-3 h-3 text-sky-400' />,
      label: 'Ark (VTXO)',
      className: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    },
    Lightning: {
      icon: <Zap className='w-3 h-3 text-amber-400' />,
      label: 'Lightning',
      className: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    },
    Onchain: {
      icon: <Globe className='w-3 h-3 text-orange-400' />,
      label: 'Bitcoin L1',
      className: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    },
  }

/**
 * Identity card for the wallet's OWN SatsPath profile. Surfaces the verified
 * identity public key, the active rails, and a one-click share action.
 */
export default function SatsPathIdentityCard({ profile, rawProfile, onShareProfile }: SatsPathIdentityCardProps) {
  const { alias, identity_pubkey, methods } = profile.profile

  const rails = methods
    .map((m) => m.type as 'Ark' | 'Lightning' | 'Onchain')
    .filter((t): t is 'Ark' | 'Lightning' | 'Onchain' => t in RAIL_META)

  const shortPubkey = identity_pubkey ? `${identity_pubkey.slice(0, 6)}...${identity_pubkey.slice(-6)}` : 'Unknown'

  const handleShare = (raw: string) => {
    if (onShareProfile) {
      onShareProfile(raw)
      return
    }
    const data = { title: `SatsPath identity — ${alias}`, text: raw }
    if (canBrowserShareData(data)) {
      shareData(data).catch(() => {})
    }
  }

  const handleCopy = async (raw: string) => {
    await copyToClipboard(raw)
    toast('Profile copied to clipboard')
  }

  const payload = rawProfile ?? JSON.stringify(profile)

  return (
    <div className='w-full rounded-2xl bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 border border-emerald-500/30 p-3.5 shadow-lg backdrop-blur-md transition-all'>
      <div className='flex items-center justify-between gap-2 mb-2'>
        <div className='flex items-center gap-2'>
          <div className='w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-xs'>
            {alias.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className='flex items-center gap-1.5'>
              <span className='font-semibold text-sm text-neutral-100'>{alias || 'My SatsPath'}</span>
              <span className='inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'>
                <ShieldCheck className='w-3 h-3 text-emerald-400' />
                SatsPath Verified
              </span>
            </div>
            <div className='text-[11px] text-neutral-400 font-mono flex items-center gap-1'>
              <span>Key: {shortPubkey}</span>
            </div>
          </div>
        </div>
      </div>

      <div className='flex items-center gap-1.5 mt-2 pt-2 border-t border-neutral-800/60'>
        <span className='text-[11px] text-neutral-400 mr-1'>Active Rails:</span>
        {rails.length > 0 ? (
          rails.map((rail) => (
            <span
              key={rail}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border ${RAIL_META[rail].className}`}
            >
              {RAIL_META[rail].icon}
              {RAIL_META[rail].label}
            </span>
          ))
        ) : (
          <span className='text-[11px] text-neutral-500'>No rails enabled</span>
        )}
      </div>

      <div className='flex items-center gap-2 mt-3'>
        <button
          type='button'
          onClick={() => handleShare(payload)}
          className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors'
        >
          <Share2 className='w-3.5 h-3.5' />
          Share Profile
        </button>
        <button
          type='button'
          onClick={() => handleCopy(payload)}
          className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-neutral-500/20 text-neutral-300 border border-neutral-500/30 hover:bg-neutral-500/30 transition-colors'
        >
          <Copy className='w-3.5 h-3.5' />
          Copy
        </button>
      </div>
    </div>
  )
}
