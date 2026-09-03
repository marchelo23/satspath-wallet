export default function WalletNewIcon() {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  return <img height='183px' width='190px' src={`${base}/wallet-new.png`} />
}
