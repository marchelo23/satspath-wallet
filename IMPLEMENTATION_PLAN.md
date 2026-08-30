# SatsPath Integration Plan for Arkade Money Wallet

## Executive Summary

Integrate SatsPath protocol into Arkade Money wallet to enable universal payment resolution via human-readable aliases (`user@domain.com`), smart multi-rail routing (Lightning/Ark/On-chain), and cryptographic identity verification.

**Goal:** Transform Arkade from an Ark-specialized wallet into a universal Bitcoin payment hub with zero-friction UX.

---

## 1. Architecture Analysis

### 1.1 SatsPath WASM API

| Function | Purpose |
|----------|---------|
| `init()` | Initialize WASM module |
| `derive_identity_keypair_from_seed(seed, index)` | Derive identity key at `m/9737'/0'` |
| `quote(recipient, amount_sats)` | Resolve alias + smart route + build payload |
| `resolve_alias(alias)` | Get signed payment profile |
| `verify_signed_profile(profile_json)` | Verify Schnorr signature |
| `fetch_fee_estimate()` | Live mempool fees |
| `build_qr_payload(...)` | Generate BOLT11/BIP21/ark: URIs |

### 1.2 Current Wallet Architecture

```
wallet/src/
├── providers/          # React Context providers
│   ├── wallet.tsx      # Core wallet state + ServiceWorkerWallet
│   ├── flow.tsx        # Send/Receive flow state
│   └── ...
├── screens/Wallet/
│   ├── Send/Form.tsx   # Current send form (address input)
│   └── Receive/        # QR code generation
├── lib/
│   ├── address.ts      # Address validation
│   └── ...
└── components/
    ├── InputAddress.tsx
    └── ...
```

**Key Integration Points:**
- `Send/Form.tsx:124` - Main send form component
- `providers/flow.tsx` - Flow state management
- `providers/wallet.tsx:785` - `initWallet()` with mnemonic
- `lib/address.ts` - Address validation functions

---

## 2. Implementation Phases

### Phase 1: Core Infrastructure (Days 1-2)

#### 2.1 Install Dependencies
```bash
# From wallet/ directory
pnpm add @satspath/wasm bip39
```

#### 2.2 Create SatsPath Provider
**File: `src/providers/satspath.tsx`**

```typescript
interface SatsPathContextProps {
  initialized: boolean
  identityPubkey: string | null
  resolveAndQuote: (alias: string, amountSats: bigint) => Promise<QuoteResponse | null>
  verifyProfile: (profileJson: string) => boolean
}

export const SatsPathProvider = ({ children }) => {
  const [initialized, setInitialized] = useState(false)
  const [identityPubkey, setIdentityPubkey] = useState<string | null>(null)
  const { svcWallet } = useContext(WalletContext)

  // Initialize WASM on mount
  useEffect(() => {
    init().then(() => setInitialized(true))
  }, [])

  // Derive identity from wallet seed
  const deriveIdentity = async (mnemonic: string) => {
    const seed = bip39.mnemonicToSeedSync(mnemonic)
    const identity = derive_identity_keypair_from_seed(seed, 0)
    if (identity) {
      setIdentityPubkey(identity.pubkey_hex)
    }
  }

  const resolveAndQuote = async (alias: string, amountSats: bigint) => {
    if (!initialized) return null
    return await quote(alias, amountSats)
  }

  return (
    <SatsPathContext.Provider value={{ initialized, identityPubkey, resolveAndQuote, verifyProfile }}>
      {children}
    </SatsPathContext.Provider>
  )
}
```

#### 2.3 Integrate with Wallet Init
**Modify: `src/providers/wallet.tsx`**

Add SatsPath identity derivation after wallet initialization:

```typescript
// In initWallet() after line 833
if (credentials.mnemonic) {
  // ... existing code ...
  
  // Derive SatsPath identity
  const satspathIdentity = derive_identity_keypair_from_seed(
    bip39.mnemonicToSeedSync(credentials.mnemonic), 0
  )
  if (satspathIdentity) {
    updateConfig({ ...config, satspathPubkey: satspathIdentity.pubkey_hex })
  }
}
```

---

### Phase 2: Send Flow Integration (Days 3-5)

#### 2.4 Modify Send Form
**File: `src/screens/Wallet/Send/Form.tsx`**

Add alias resolution to recipient input:

```typescript
// Add state for SatsPath resolution
const [satspathQuote, setSatspathQuote] = useState<QuoteResponse | null>(null)
const [isResolving, setIsResolving] = useState(false)

// Modify handleRecipientChange to detect aliases
const handleRecipientChange = async (recipient: string) => {
  // ... existing debounce logic ...
  
  // Check if input is a SatsPath alias (contains @)
  if (recipient.includes('@') && !recipient.includes(' ')) {
    setIsResolving(true)
    try {
      const quote = await resolveAndQuote(recipient, BigInt(sendInfo.satoshis || 0))
      if (quote?.status === 'ok') {
        setSatspathQuote(quote)
        // Auto-fill based on selected rail
        handleRailSelection(quote)
      }
    } catch (err) {
      consoleError(err, 'SatsPath resolution failed')
    } finally {
      setIsResolving(false)
    }
  } else {
    setSatspathQuote(null)
  }
}

// Add rail selection handler
const handleRailSelection = (quote: QuoteResponse) => {
  const { selected_method } = quote
  switch (selected_method.type) {
    case 'Lightning':
      setSendInfo(prev => ({ ...prev, invoice: quote.qr }))
      break
    case 'Ark':
      setSendInfo(prev => ({ ...prev, arkAddress: quote.qr }))
      break
    case 'Onchain':
      setSendInfo(prev => ({ ...prev, address: extractBtcAddress(quote.qr) }))
      break
  }
}
```

#### 2.5 Add SatsPath Quote Display Component
**File: `src/components/SatsPathQuote.tsx`**

```typescript
interface SatsPathQuoteProps {
  quote: QuoteResponse
  onSelectRail: (method: PaymentMethod) => void
}

export function SatsPathQuote({ quote, onSelectRail }: SatsPathQuoteProps) {
  return (
    <Shadow>
      <FlexCol gap='0.75rem' padding='1rem'>
        <FlexRow between>
          <Text bold>SatsPath Route</Text>
          <VerifiedBadge />
        </FlexRow>
        
        <FlexRow gap='0.5rem'>
          <RailOption 
            icon='⚡' 
            label='Lightning' 
            fee={quote.fee_sats}
            selected={quote.selected_method.type === 'Lightning'}
            onClick={() => onSelectRail({ type: 'Lightning' })}
          />
          <RailOption 
            icon='🏹' 
            label='Ark' 
            fee={quote.fee_sats}
            selected={quote.selected_method.type === 'Ark'}
            onClick={() => onSelectRail({ type: 'Ark' })}
          />
          <RailOption 
            icon='⛓️' 
            label='On-chain' 
            fee={quote.fee_sats}
            selected={quote.selected_method.type === 'Onchain'}
            onClick={() => onSelectRail({ type: 'Onchain' })}
          />
        </FlexRow>
        
        <Text smaller color='neutral-500'>
          Fee: {quote.fee_sats} sats | Recipient: {quote.recipient.alias}
        </Text>
      </FlexCol>
    </Shadow>
  )
}
```

#### 2.6 Add Alias Validation
**File: `src/lib/address.ts`**

```typescript
export const isSatsPathAlias = (value: string): boolean => {
  // Basic format: local@domain.tld
  const aliasRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  return aliasRegex.test(value)
}

export const extractRailFromQuote = (quote: QuoteResponse): {
  address?: string
  arkAddress?: string
  invoice?: string
} => {
  const { qr, selected_method } = quote
  switch (selected_method.type) {
    case 'Lightning':
      return { invoice: qr }
    case 'Ark':
      return { arkAddress: qr }
    case 'Onchain':
      return { address: extractBtcAddressFromBip21(qr) }
    default:
      return {}
  }
}
```

---

### Phase 3: Receive Flow & Profile (Days 6-7)

#### 2.7 Publish User Profile
**File: `src/screens/Wallet/Receive/Profile.tsx`**

```typescript
export function ReceiveProfile() {
  const { identityPubkey } = useContext(SatsPathContext)
  const { aspInfo } = useContext(AspContext)
  const { svcWallet } = useContext(WalletContext)
  
  const [profilePublished, setProfilePublished] = useState(false)
  
  const publishProfile = async () => {
    if (!identityPubkey || !svcWallet) return
    
    // Get receiving addresses
    const addresses = await getReceivingAddresses(svcWallet)
    
    // Create signed profile
    const profile = {
      alias: `${userAlias}@${window.location.hostname}`,
      pubkey: identityPubkey,
      lightning: addresses.lightningAddress,
      ark: addresses.offchainAddr,
      onchain: addresses.boardingAddr,
    }
    
    // Profile is signed client-side and published via SatsPath protocol
    // ... publish logic ...
    setProfilePublished(true)
  }
  
  return (
    <FlexCol gap='1rem'>
      <Text>Your SatsPath Profile</Text>
      <Text color='neutral-500'>
        {identityPubkey ? `Pubkey: ${identityPubkey.slice(0, 16)}...` : 'Not initialized'}
      </Text>
      <Button 
        label='Publish Profile' 
        onClick={publishProfile}
        disabled={!identityPubkey || profilePublished}
      />
    </FlexCol>
  )
}
```

---

### Phase 4: UI Theme Integration (Day 8)

#### 2.8 Apply SatsPath Colors
**File: `src/tokens.css`**

```css
:root {
  /* SatsPath Theme */
  --satspath-black: #000000;
  --satspath-red: #FF0000;
  --satspath-white: #FFFFFF;
  --satspath-charcoal: #1A1A1A;
  
  /* Integration with existing theme */
  --color-primary: var(--satspath-red);
  --color-background: var(--satspath-black);
  --color-surface: var(--satspath-charcoal);
  --color-text: var(--satspath-white);
}
```

#### 2.9 SatsPath-Specific Components
**File: `src/components/SatsPathBadge.tsx`**

```typescript
export function SatsPathVerified() {
  return (
    <span className='satspath-badge'>
      <span className='satspath-badge__icon'>✓</span>
      <span className='satspath-badge__text'>SatsPath Verified</span>
    </span>
  )
}
```

---

### Phase 5: Testing & Validation (Days 9-10)

#### 2.10 Unit Tests
**File: `src/test/satspath.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { isSatsPathAlias, extractRailFromQuote } from '../lib/address'

describe('SatsPath Integration', () => {
  it('validates alias format', () => {
    expect(isSatsPathAlias('user@domain.com')).toBe(true)
    expect(isSatsPathAlias('invalid')).toBe(false)
    expect(isSatsPathAlias('@domain.com')).toBe(false)
  })
  
  it('extracts rail from quote', () => {
    const quote = {
      status: 'ok',
      selected_method: { type: 'Lightning' },
      qr: 'lnbc1...',
      fee_sats: 1,
    }
    const result = extractRailFromQuote(quote)
    expect(result.invoice).toBe('lnbc1...')
  })
})
```

#### 2.11 E2E Tests
**File: `playwright/satspath.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'

test('sends payment via SatsPath alias', async ({ page }) => {
  await page.goto('/wallet/send')
  
  // Enter alias
  await page.fill('[name="send-address"]', 'test@satspath.dev')
  
  // Wait for resolution
  await page.waitForSelector('.satspath-quote')
  
  // Verify quote displayed
  await expect(page.locator('.satspath-quote')).toBeVisible()
  await expect(page.locator('.satspath-quote')).toContainText('Lightning')
  
  // Enter amount
  await page.fill('[name="send-amount"]', '10000')
  
  // Continue
  await page.click('button:has-text("Continue")')
  
  // Verify payment details
  await expect(page.locator('.payment-summary')).toBeVisible()
})
```

---

## 3. File Structure Changes

```
wallet/src/
├── providers/
│   ├── satspath.tsx          # NEW: SatsPath context provider
│   └── wallet.tsx            # MODIFIED: Add identity derivation
├── screens/Wallet/
│   ├── Send/
│   │   └── Form.tsx          # MODIFIED: Add alias resolution
│   └── Receive/
│       ├── QrCode.tsx        # MODIFIED: Add profile publish
│       └── Profile.tsx       # NEW: Profile management
├── components/
│   ├── SatsPathQuote.tsx     # NEW: Quote display component
│   ├── SatsPathBadge.tsx     # NEW: Verification badge
│   └── RailSelector.tsx      # NEW: Rail selection UI
├── lib/
│   ├── address.ts            # MODIFIED: Add alias validation
│   └── satspath.ts           # NEW: SatsPath utility functions
└── test/
    └── satspath.test.ts      # NEW: Unit tests
```

---

## 4. Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@satspath/wasm` | latest | Core WASM bindings |
| `bip39` | ^1.0.0 | Mnemonic to seed conversion |

---

## 5. Security Considerations

1. **Zero Custody:** SatsPath never accesses private keys - only derives identity at `m/9737'/0'`
2. **Client-Side Verification:** All profile signatures verified via secp256k1 Schnorr
3. **SSRF Protection:** Resolver validates URLs, blocks private IPs
4. **Fail-Closed:** Invalid signatures reject payment automatically

---

## 6. Success Metrics

| Metric | Target |
|--------|--------|
| Alias resolution time | < 2 seconds |
| Quote generation time | < 3 seconds |
| Identity derivation | < 100ms |
| Profile publish | < 5 seconds |
| E2E test coverage | > 80% |

---

## 7. Rollback Plan

1. Feature flag: `VITE_SATSPATH_ENABLED=true`
2. Graceful degradation: If WASM fails to load, fall back to address-only input
3. Profile data stored locally, not dependent on external services

---

## 8. Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1 | 2 days | Core infrastructure, provider, WASM init |
| Phase 2 | 3 days | Send flow integration, quote display |
| Phase 3 | 2 days | Receive flow, profile management |
| Phase 4 | 1 day | UI theme, SatsPath colors |
| Phase 5 | 2 days | Testing, validation, E2E |
| **Total** | **10 days** | **Full integration** |

---

## 9. Open Questions

1. **Profile Storage:** Should profiles be published to Nostr relays or SatsPath daemon?
2. **Alias Registration:** How does a user claim their alias (e.g., `chelo@arkade.computer`)?
3. **Multi-Device:** How to sync SatsPath identity across devices?
4. **Error Handling:** What happens when SatsPath daemon is unreachable?

---

## 10. Next Steps

1. Review and approve this plan
2. Set up development environment with WASM build
3. Create feature branch: `feature/satspath-integration`
4. Begin Phase 1 implementation
