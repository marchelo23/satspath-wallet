export default function ComingSoonIcon() {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  return <img height='48px' width='48px' src={`${base}/coming-soon.png`} />
}
