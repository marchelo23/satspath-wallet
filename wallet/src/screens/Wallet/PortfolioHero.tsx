import { forwardRef } from 'react'
import { usePortfolioBalanceDisplay } from '../../hooks/usePortfolioBalanceDisplay'
import { PrivacyAmount } from '../../components/PrivacyAmount'

interface PortfolioHeroProps {
  collapseProgress?: number
}

/**
 * Fiat-primary total balance across BTC + all assets.
 * Matches master Balance component styling.
 */
const PortfolioHero = forwardRef<HTMLDivElement, PortfolioHeroProps>(function PortfolioHero(
  { collapseProgress = 0 },
  ref,
) {
  const { balance, maskedBalance, unit } = usePortfolioBalanceDisplay()
  const clampedProgress = Math.max(0, Math.min(1, collapseProgress))

  return (
    <div className='mb-2 mt-8 flex w-full flex-col items-center justify-center text-white'>
      <div
        ref={ref}
        className='flex items-baseline gap-2'
        style={{
          color: 'var(--fg, #ffffff)',
          opacity: 1 - clampedProgress,
          transform: `translate3d(0, ${-18 * clampedProgress}px, 0) scale(${1 - 0.28 * clampedProgress})`,
          transformOrigin: 'center top',
          willChange: clampedProgress > 0 && clampedProgress < 1 ? 'transform, opacity' : 'auto',
        }}
      >
        <PrivacyAmount className='text-heading-xl text-white font-semibold' masked={maskedBalance} testId='main-balance' interactive>
          {balance}
        </PrivacyAmount>
        {unit ? <span className='text-xl text-neutral-300'>{unit}</span> : null}
      </div>
    </div>
  )
})

export default PortfolioHero
