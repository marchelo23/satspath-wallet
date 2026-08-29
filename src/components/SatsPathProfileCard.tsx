import React from 'react'
import { SignedPaymentProfile } from '@satspath/resolvers'
import { ShieldCheck, Zap, Layers, Globe } from 'lucide-react'

interface SatsPathProfileCardProps {
  profile: SignedPaymentProfile
  onSelectRail?: (railType: 'Ark' | 'Lightning' | 'Onchain') => void
}

export default function SatsPathProfileCard({ profile, onSelectRail }: SatsPathProfileCardProps) {
  const { alias, identity_pubkey, methods } = profile.profile

  const hasArk = methods.some((m) => m.type === 'Ark')
  const hasLightning = methods.some((m) => m.type === 'Lightning')
  const hasOnchain = methods.some((m) => m.type === 'Onchain')

  const shortPubkey = identity_pubkey ? `${identity_pubkey.slice(0, 6)}...${identity_pubkey.slice(-6)}` : 'Unknown'

  return (
    <div className='w-full rounded-2xl bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 border border-emerald-500/30 p-3.5 shadow-lg backdrop-blur-md transition-all'>
      <div className='flex items-center justify-between gap-2 mb-2'>
        <div className='flex items-center gap-2'>
          <div className='w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-xs'>
            {alias.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className='flex items-center gap-1.5'>
              <span className='font-semibold text-sm text-neutral-100'>{alias}</span>
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
        <span className='text-[11px] text-neutral-400 mr-1'>Available Rails:</span>
        {hasArk ? (
          <span
            onClick={() => onSelectRail?.('Ark')}
            className='inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-sky-500/20 text-sky-300 border border-sky-500/30 cursor-pointer hover:bg-sky-500/30 transition-colors'
          >
            <Layers className='w-3 h-3 text-sky-400' />
            Ark (VTXO)
          </span>
        ) : null}
        {hasLightning ? (
          <span
            onClick={() => onSelectRail?.('Lightning')}
            className='inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/30 cursor-pointer hover:bg-amber-500/30 transition-colors'
          >
            <Zap className='w-3 h-3 text-amber-400' />
            Lightning
          </span>
        ) : null}
        {hasOnchain ? (
          <span
            onClick={() => onSelectRail?.('Onchain')}
            className='inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-orange-500/20 text-orange-300 border border-orange-500/30 cursor-pointer hover:bg-orange-500/30 transition-colors'
          >
            <Globe className='w-3 h-3 text-orange-400' />
            Bitcoin L1
          </span>
        ) : null}
      </div>
    </div>
  )
}
