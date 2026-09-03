export default function FujiMoneyIcon({ big }: { big?: boolean }) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  const size = big ? 78 : 55
  return <img height={size} width={size} src={`${base}/fuji-money.jpg`} alt='Fuji Money' style={{ borderRadius: '50%' }} />
}
