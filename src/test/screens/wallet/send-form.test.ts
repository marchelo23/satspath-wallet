import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, act, waitFor } from '@testing-library/react'
import SendForm, { isPlainOnchainTypedRecipient } from '../../../screens/Wallet/Send/Form'
import { FlowContext } from '../../../providers/flow'
import { AspContext } from '../../../providers/asp'
import { WalletContext } from '../../../providers/wallet'
import { NavigationContext } from '../../../providers/navigation'
import { ConfigContext } from '../../../providers/config'
import { FiatContext } from '../../../providers/fiat'
import { OptionsContext } from '../../../providers/options'
import { LimitsContext } from '../../../providers/limits'
import React from 'react'
import {
  mockAspContextValue,
  mockConfigContextValue,
  mockFiatContextValue,
  mockFlowContextValue,
  mockLimitsContextValue,
  mockNavigationContextValue,
  mockOptionsContextValue,
  mockSvcWallet,
  mockWalletContextValue,
} from '../mocks'

const BTC_ADDRESS = 'bcrt1pq6gt72nxevsxk5fwl3h2sx56jeah6qfzh98mksxyakkg5l0q65gsa27khh'
const ARK_ADDRESS =
  'ARK1QQ4HFSSPRTCGNJZF8QLW2F78YVJAU5KLDFUGG29K34Y7J96Q2W4T4USH2JZ072D0ALD83VLWZRKDG24R40WRCM8XJW6AX7YPNJHTEZGU4A9R8D'
// A real mainnet invoice with a 21 000-sat amount that decodeInvoice can parse.
const REAL_INVOICE =
  'lnbc21u1pnk8larsp526g88ejh9ac0es9j6juxwenzdzvs6hcrphna5pp3jefpukmtk3hqpp5m206npk0fr6k45u8f90capqw48k3pzymlqhk0j98kyx4mz383pkqdz9235x2gr3w45kx6eqvfex7amwypnx77pqdf6k6urnyphhvetjyp6xsefqd3sh57fqv3hkwxqyp2xqcqz95rzjqv9ruzr6quwpsuwmyshlvenk0xm7djrtt8ugt2ja6cx3dkqtccdgvzzxeyqq28qqqqqqqqqqqqqqq9gq2y9qyysgqvu5k5w9q0xe62envhds058r9h8v5uak09hn3uzlw39sqkcuwh34j44gc53j6x6sg0u6yf6l0durxqqekytupxpf66zc7rc9cpav72ssqpcgv3p'

describe('isPlainOnchainTypedRecipient', () => {
  it('returns true for a bare BTC address', () => {
    expect(isPlainOnchainTypedRecipient(BTC_ADDRESS)).toBe(true)
  })

  it('returns true for a BIP21 URI with a valid BTC address only', () => {
    expect(isPlainOnchainTypedRecipient(`bitcoin:${BTC_ADDRESS}`)).toBe(true)
  })

  it('returns false for a BIP21 URI with a malformed address', () => {
    expect(isPlainOnchainTypedRecipient('bitcoin:not-an-address')).toBe(false)
  })

  it('returns false for a BIP21 URI mixing a BTC address with an ark address', () => {
    expect(isPlainOnchainTypedRecipient(`bitcoin:${BTC_ADDRESS}?ark=${ARK_ADDRESS}`)).toBe(false)
  })

  it('returns false for a BIP21 URI mixing a BTC address with a lightning invoice', () => {
    expect(isPlainOnchainTypedRecipient(`bitcoin:${BTC_ADDRESS}?lightning=lnbc1abc`)).toBe(false)
  })

  it('returns false for a BIP21 URI mixing a BTC address with an lnurl', () => {
    expect(isPlainOnchainTypedRecipient(`bitcoin:${BTC_ADDRESS}?lightning=lnurl1abc`)).toBe(false)
  })

  it('returns false for a BIP21 URI mixing a BTC address with an assetId', () => {
    expect(isPlainOnchainTypedRecipient(`bitcoin:${BTC_ADDRESS}?assetid=someasset`)).toBe(false)
  })

  it('returns false for an ark-only BIP21 URI', () => {
    expect(isPlainOnchainTypedRecipient(`bitcoin:?ark=${ARK_ADDRESS}`)).toBe(false)
  })

  it('returns false for a non-BIP21, non-address value', () => {
    expect(isPlainOnchainTypedRecipient('not a recipient at all')).toBe(false)
  })
})

describe('Send form amount editability', () => {
  // Use fake timers to control the 800 ms recipient-input debounce without
  // real I/O. shouldAdvanceTime keeps React's internal scheduler working.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const renderSendForm = (flowContext = mockFlowContextValue) =>
    render(
      React.createElement(
        NavigationContext.Provider,
        { value: mockNavigationContextValue },
        React.createElement(
          AspContext.Provider,
          { value: mockAspContextValue },
          React.createElement(
            ConfigContext.Provider,
            { value: mockConfigContextValue as any },
            React.createElement(
              FiatContext.Provider,
              { value: mockFiatContextValue as any },
              React.createElement(
                OptionsContext.Provider,
                { value: mockOptionsContextValue as any },
                React.createElement(
                  FlowContext.Provider,
                  { value: flowContext as any },
                  React.createElement(
                    WalletContext.Provider,
                    {
                      value: {
                        ...mockWalletContextValue,
                        svcWallet: {
                          ...mockSvcWallet,
                          getAddress: () => 'tark1mockoffchain',
                          getBoardingAddress: () => Promise.resolve('bcrt1mockboarding'),
                        } as any,
                      } as any,
                    },
                    React.createElement(
                      LimitsContext.Provider,
                      { value: mockLimitsContextValue },
                      React.createElement(SendForm, null),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    )

  it('unlocks the amount field when switching from an invoice recipient to an address recipient', async () => {
    // regression: setAmountIsReadOnly(true) from the invoice branch was never
    // reset when the user replaced the invoice with a plain address, leaving
    // the amount locked. The fix adds setAmountIsReadOnly(false) at the top of
    // each parse run.
    renderSendForm()

    const recipientInput = document.querySelector('input[name="send-recipient"]') as HTMLInputElement
    const amountInput = document.querySelector('input[name="send-amount"]') as HTMLInputElement

    // Step 1: type the invoice — this should lock the amount field
    fireEvent.change(recipientInput, { target: { value: REAL_INVOICE } })
    await act(async () => {
      vi.advanceTimersByTime(900) // past the 800 ms debounce
    })
    await waitFor(() => expect(amountInput).toHaveAttribute('readonly'))

    // Step 2: replace with a plain address — amount field must become editable
    fireEvent.change(recipientInput, { target: { value: BTC_ADDRESS } })
    await act(async () => {
      vi.advanceTimersByTime(900)
    })
    await waitFor(() => expect(amountInput).not.toHaveAttribute('readonly'))
  })
})
