import { useContext } from 'react'
import { SatsPathContext } from '../providers/satspath'

interface SatsPathVerifiedProps {
  showText?: boolean
  size?: 'small' | 'medium' | 'large'
}

export default function SatsPathVerified({ showText = true, size = 'small' }: SatsPathVerifiedProps) {
  const { initialized } = useContext(SatsPathContext)

  if (!initialized) return null

  const sizeStyles = {
    small: { fontSize: '10px', padding: '2px 6px' },
    medium: { fontSize: '12px', padding: '3px 8px' },
    large: { fontSize: '14px', padding: '4px 10px' },
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        background: 'var(--satspath-red-20)',
        color: '#FF0000',
        borderRadius: '4px',
        fontWeight: 600,
        lineHeight: 1,
        ...sizeStyles[size],
      }}
    >
      <span style={{ fontSize: '1.1em' }}>✓</span>
      {showText && <span>SatsPath</span>}
    </span>
  )
}
