import React from 'react'
import { Zap, Layers, Globe, Sparkles, Clock, ShieldCheck } from 'lucide-react'
import { SatsPathMultiRailAnalysis, SatsPathRailQuote } from '../lib/satspath'
import { type PaymentUrgency } from '@satspath/router'

interface SatsPathRouteSelectorProps {
  analysis: SatsPathMultiRailAnalysis
  selectedRail: 'Ark' | 'Lightning' | 'Onchain'
  onSelectRail: (rail: 'Ark' | 'Lightning' | 'Onchain') => void
  urgency: PaymentUrgency
  onChangeUrgency?: (urgency: PaymentUrgency) => void
}

export default function SatsPathRouteSelector({
  analysis,
  selectedRail,
  onSelectRail,
  urgency,
  onChangeUrgency,
}: SatsPathRouteSelectorProps) {
  const { quotes, recommendedRail, recommendedReason } = analysis

  const railsList: {
    key: 'Ark' | 'Lightning' | 'Onchain'
    name: string
    icon: React.ReactNode
    quote?: SatsPathRailQuote
    borderColor: string
  }[] = [
    {
      key: 'Ark',
      name: 'Ark (VTXO)',
      icon: <Layers className='w-4 h-4 text-sky-400' />,
      quote: quotes.ark,
      borderColor: 'border-sky-500/50',
    },
    {
      key: 'Lightning',
      name: 'Lightning',
      icon: <Zap className='w-4 h-4 text-amber-400' />,
      quote: quotes.lightning,
      borderColor: 'border-amber-500/50',
    },
    {
      key: 'Onchain',
      name: 'Bitcoin L1',
      icon: <Globe className='w-4 h-4 text-orange-400' />,
      quote: quotes.onchain,
      borderColor: 'border-orange-500/50',
    },
  ]

  return (
    <div className='w-full rounded-2xl bg-neutral-900/80 border border-neutral-800 p-4 shadow-xl backdrop-blur-md transition-all'>
      {/* Header with SatsPath AI recommendation */}
      <div className='flex items-center justify-between gap-2 mb-3'>
        <div className='flex items-center gap-1.5'>
          <Sparkles className='w-4 h-4 text-amber-400 animate-pulse' />
          <span className='font-semibold text-xs uppercase tracking-wider text-neutral-200'>
            SatsPath Route Optimization
          </span>
        </div>
        <div className='flex items-center gap-1 bg-neutral-800/80 p-0.5 rounded-lg border border-neutral-700/50'>
          {(['low', 'normal', 'high'] as PaymentUrgency[]).map((u) => (
            <button
              key={u}
              type='button'
              onClick={() => onChangeUrgency?.(u)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded capitalize transition-all ${
                urgency === u ? 'bg-neutral-700 text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {/* Recommendation reason banner */}
      <div className='mb-3 p-2.5 rounded-xl bg-neutral-950/60 border border-neutral-800/80 text-xs text-neutral-300 flex items-start gap-2'>
        <div className='mt-0.5 text-emerald-400'>
          <ShieldCheck className='w-3.5 h-3.5' />
        </div>
        <div className='flex-1'>
          <span className='font-medium text-emerald-400'>Recommended: {recommendedRail}</span>
          <p className='text-[11px] text-neutral-400 mt-0.5 leading-relaxed'>{recommendedReason}</p>
        </div>
      </div>

      {/* Rail selection options grid */}
      <div className='grid grid-cols-3 gap-2'>
        {railsList.map(({ key, name, icon, quote, borderColor }) => {
          if (!quote) return null
          const isSelected = selectedRail === key
          const isRec = recommendedRail === key

          return (
            <div
              key={key}
              onClick={() => onSelectRail(key)}
              className={`relative cursor-pointer rounded-xl p-2.5 flex flex-col justify-between border transition-all duration-200 ${
                isSelected
                  ? `bg-neutral-800/90 ${borderColor} shadow-md scale-[1.02]`
                  : 'bg-neutral-950/40 border-neutral-800/60 hover:bg-neutral-900/60 opacity-80 hover:opacity-100'
              }`}
            >
              {isRec ? (
                <span className='absolute -top-2 right-2 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-gradient-to-r from-emerald-500 to-teal-500 text-black shadow'>
                  BEST
                </span>
              ) : null}

              <div className='flex items-center gap-1.5 mb-2'>
                {icon}
                <span className='text-xs font-semibold text-neutral-200 truncate'>{name}</span>
              </div>

              <div className='space-y-1 text-left'>
                <div className='text-[11px] font-mono text-neutral-300 font-medium'>
                  {quote.estimatedFeeSats === 0 ? (
                    <span className='text-emerald-400 font-bold'>0 sats fee</span>
                  ) : (
                    <span>~{quote.estimatedFeeSats} sats</span>
                  )}
                </div>

                <div className='flex items-center gap-1 text-[10px] text-neutral-400'>
                  <Clock className='w-2.5 h-2.5 text-neutral-500' />
                  <span className='truncate'>{quote.estimatedConfirmation}</span>
                </div>

                {quote.savingsSats && quote.savingsSats > 0 ? (
                  <div className='text-[9px] text-emerald-400/90 font-medium'>Save ~{quote.savingsSats} sats</div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
