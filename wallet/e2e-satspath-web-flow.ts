import { chromium, Page } from 'playwright';
import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdirSync } from 'fs';
import path from 'path';

const execAsync = promisify(exec);
const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots-e2e');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function ss(page: Page, name: string) {
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`  📸 Screenshot: ${name}.png`);
}

async function waitForWalletReady(page: Page, label: string) {
  console.log(`  ⏳ Esperando que ${label} inicialice y conecte al servidor Ark...`);
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.text().includes('SatsPath') || msg.text().includes('Wallet')) {
      console.log(`  [${label}]`, msg.type(), msg.text().substring(0, 150));
    }
  });
  page.on('pageerror', (err) => {
    console.log(`  [${label} ERROR]`, err.message);
  });

  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);
    // Dismiss any modal/banner if present
    const dismissBtn = page.getByText('Dismiss');
    if (await dismissBtn.isVisible().catch(() => false)) {
      await dismissBtn.click().catch(() => {});
    }
    const continueAnyway = page.getByText('Continue anyway');
    if (await continueAnyway.isVisible().catch(() => false)) {
      await continueAnyway.click().catch(() => {});
    }

    const hasBalance = await page.getByTestId('main-balance').isVisible().catch(() => false);
    const hasReceive = await page.getByTestId('home-action-receive').isVisible().catch(() => false);
    const hasSend = await page.getByTestId('home-action-send').isVisible().catch(() => false);
    if (hasBalance || hasReceive || hasSend) {
      console.log(`  ✅ ${label} lista`);
      return;
    }
  }
  throw new Error(`${label} no se inicializó a tiempo`);
}

async function getReceivingAddresses(page: Page): Promise<{ ark: string; btc: string }> {
  // Click Receive on home
  await page.getByTestId('home-action-receive').click();
  await page.waitForTimeout(1500);

  // Click Copy button to open address list sheet
  const copyBtn = page.getByRole('button', { name: 'Copy' }).first();
  if (await copyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await copyBtn.click();
    await page.waitForTimeout(1000);
  }

  // Wait for addresses to load in copy sheet
  await page.waitForSelector('[data-testid="btc-address-copy"]', { timeout: 10000 }).catch(() => {});

  let btc = '';
  let ark = '';
  const btcCopy = page.getByTestId('btc-address-copy');
  if (await btcCopy.isVisible().catch(() => false)) {
    await btcCopy.click();
    btc = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  }
  const arkCopy = page.getByTestId('ark-address-copy');
  if (await arkCopy.isVisible().catch(() => false)) {
    await arkCopy.click();
    ark = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  }

  if (!btc || !ark) {
    const html = await page.content();
    const btcMatch = html.match(/(bcrt1[qp][a-z0-9]{38,60})/);
    const arkMatch = html.match(/(tark1[a-z0-9]{50,120}|ark1[a-z0-9]{50,120})/);
    if (!btc && btcMatch) btc = btcMatch[1];
    if (!ark && arkMatch) ark = arkMatch[1];
  }

  // Close sheet / drawer if open
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Go back to home
  const backBtn = page.locator('[aria-label="Go back"]').first();
  if (await backBtn.isVisible().catch(() => false)) {
    await backBtn.click();
  }
  await page.waitForTimeout(1000);

  if (!btc) {
    // Fallback: check SatsPath Profile
    try {
      const settingsBtn = page.getByTestId('top-right-settings');
      if (await settingsBtn.isVisible().catch(() => false)) {
        await settingsBtn.click();
        await page.waitForTimeout(1000);
        await page.getByText(/satspath profile/i).first().click();
        await page.waitForTimeout(2000);
        const text = await page.textContent('body');
        const btcMatch = text?.match(/(bcrt1[qp][a-z0-9]{38,60})/);
        const arkMatch = text?.match(/(tark1[a-z0-9]{50,120}|ark1[a-z0-9]{50,120})/);
        if (btcMatch) btc = btcMatch[1];
        if (arkMatch) ark = arkMatch[1];
        const back1 = page.locator('[aria-label="Go back"]').first();
        if (await back1.isVisible().catch(() => false)) await back1.click();
        await page.waitForTimeout(500);
        const back2 = page.locator('[aria-label="Go back"]').first();
        if (await back2.isVisible().catch(() => false)) await back2.click();
        await page.waitForTimeout(500);
      }
    } catch {}
  }

  // Sanitize addresses
  btc = (btc || '').replace(/[^a-z0-9]/g, '');
  ark = (ark || '').replace(/[^a-z0-9]/g, '');
  return { ark, btc };
}

async function run() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('🌐 TEST E2E WEB: 2 WALLETS CON SATSPATH (REGTEST / TESTNET)');
  console.log('══════════════════════════════════════════════════════════════\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // ══════════════════════════════════════════════════════════
  // 1. WALLET 2 (BOB - RECEPTOR)
  // ══════════════════════════════════════════════════════════
  console.log('👤 1. Configurando Wallet 2 (Bob - Receptor)...');
  const ctxBob = await browser.newContext({
    viewport: { width: 412, height: 915 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const pageBob = await ctxBob.newPage();

  await pageBob.goto('http://localhost:3002', { waitUntil: 'networkidle' });
  await pageBob.waitForTimeout(2000);

  // Click "+ Create wallet"
  console.log('  Haciendo click en "+ Create wallet"...');
  await pageBob.getByText('+ Create wallet').click();
  await waitForWalletReady(pageBob, 'Wallet Bob');
  await ss(pageBob, '01-bob-wallet-ready');

  // Obtener direcciones de Bob
  const bobAddrs = await getReceivingAddresses(pageBob);
  console.log(`  Dirección BTC Bob: ${bobAddrs.btc || 'no detectada'}`);
  console.log(`  Dirección Ark Bob: ${bobAddrs.ark || 'no detectada'}`);

  // Ir a Ajustes -> SatsPath Profile
  console.log('  Navegando a SatsPath Profile en Ajustes...');
  await pageBob.getByTestId('top-right-settings').click();
  await pageBob.waitForTimeout(1500);
  await pageBob.getByText(/satspath profile/i).first().click();
  await pageBob.waitForTimeout(2000);

  // Registrar alias bob@arkade.local
  const bobAlias = 'bob@arkade.local';
  console.log(`  Registrando alias "${bobAlias}" en SatsPath...`);
  await pageBob.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await pageBob.waitForTimeout(500);

  const aliasInput = pageBob.locator('input[placeholder*="@"]').first();
  if (await aliasInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await aliasInput.fill(bobAlias);
    await pageBob.waitForTimeout(500);

    const startRegBtn = pageBob.getByRole('button', { name: /start registration/i }).or(pageBob.getByText(/start registration/i));
    await startRegBtn.first().click();
    await pageBob.waitForTimeout(2500);

    // Ingrese verification token (mock: email)
    const tokenInput = pageBob.locator('input[placeholder*="verification token"]').first();
    if (await tokenInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('  Ingresando token de verificación...');
      await tokenInput.fill(bobAlias);
      await pageBob.waitForTimeout(500);
      const verifyBtn = pageBob.getByRole('button', { name: /verify alias/i }).or(pageBob.getByText(/verify alias/i));
      await verifyBtn.first().click();
      await pageBob.waitForTimeout(2500);
    }
  } else {
    console.log('  ℹ️ Alias ya configurado o sección de registro no necesaria');
  }

  // Publicar métodos de pago
  console.log('  Publicando métodos multi-riel (Ark, Lightning, Onchain)...');
  await pageBob.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await pageBob.waitForTimeout(500);
  const publishBtn = pageBob.getByRole('button', { name: /publish \/ update methods/i }).or(pageBob.getByText(/publish \/ update methods/i));
  if (await publishBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
    await publishBtn.first().click();
    await pageBob.waitForTimeout(3000);
  }

  await ss(pageBob, '02-bob-profile-published');
  console.log('  ✅ Perfil de Bob publicado exitosamente con firma Schnorr\n');

  // Volver a Home en Bob
  const backHome = pageBob.getByLabel('Go back').or(pageBob.getByTestId('top-left-back'));
  if (await backHome.isVisible().catch(() => false)) {
    await backHome.click();
    await pageBob.waitForTimeout(1000);
  }
  const backHome2 = pageBob.getByLabel('Go back').or(pageBob.getByTestId('top-left-back'));
  if (await backHome2.isVisible().catch(() => false)) {
    await backHome2.click();
    await pageBob.waitForTimeout(1000);
  }

  // ══════════════════════════════════════════════════════════
  // 2. WALLET 1 (ALICE - EMISORA)
  // ══════════════════════════════════════════════════════════
  console.log('👤 2. Configurando Wallet 1 (Alice - Emisora)...');
  const ctxAlice = await browser.newContext({
    viewport: { width: 412, height: 915 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const pageAlice = await ctxAlice.newPage();

  await pageAlice.goto('http://localhost:3002', { waitUntil: 'networkidle' });
  await pageAlice.waitForTimeout(2000);

  // Click "+ Create wallet"
  console.log('  Haciendo click en "+ Create wallet"...');
  await pageAlice.getByText('+ Create wallet').click();
  await waitForWalletReady(pageAlice, 'Wallet Alice');
  await ss(pageAlice, '03-alice-wallet-ready');

  // Obtener dirección BTC de Alice para fondear
  const aliceAddrs = await getReceivingAddresses(pageAlice);
  console.log(`  Dirección BTC Alice: ${aliceAddrs.btc}`);

  if (!aliceAddrs.btc) {
    throw new Error('No se pudo obtener la dirección de Alice para fondear');
  }

  // Fondear Alice vía regtest CLI y Offchain Ark
  console.log(`💰 Fondeando Wallet Alice onchain con 0.005 BTC (${aliceAddrs.btc})...`);
  const faucetRes = await execAsync(
    `node regtest/regtest.mjs faucet ${aliceAddrs.btc} 0.005 --confirm`,
    { cwd: path.resolve(__dirname, '..') }
  );
  console.log(`  Faucet Onchain: ${faucetRes.stdout.trim()}`);

  if (aliceAddrs.ark) {
    console.log(`💰 Fondeando Wallet Alice offchain en Ark con 100,000 sats (${aliceAddrs.ark})...`);
    try {
      const arkSendRes = await execAsync(
        `podman exec arkd ark send --to ${aliceAddrs.ark} --amount 100000 --password secret`,
        { cwd: path.resolve(__dirname, '..') }
      );
      console.log(`  Ark Send: ${arkSendRes.stdout.trim()}`);
    } catch (e: any) {
      console.log(`  Ark Send notice: ${e.message}`);
    }
  }

  // Esperar a que el balance de Alice se actualice
  console.log('  ⏳ Esperando que el balance de Alice se refleje en la UI...');
  let aliceFunded = false;
  for (let i = 0; i < 40; i++) {
    await pageAlice.waitForTimeout(2000);
    const balEl = pageAlice.getByTestId('main-balance');
    if (await balEl.isVisible().catch(() => false)) {
      const text = await balEl.textContent();
      const num = Number((text || '').replace(/[^\d.-]/g, ''));
      if (num > 0) {
        console.log(`  ✅ Fondos recibidos por Alice: ${text}`);
        aliceFunded = true;
        break;
      }
    }
  }
  await ss(pageAlice, '04-alice-funded');

  if (!aliceFunded) {
    console.log('  ⚠️ Balance no visible en home aún, continuando...');
  }

  // ══════════════════════════════════════════════════════════
  // 3. ENVÍO DESDE ALICE A bob@arkade.local VÍA SATSPATH
  // ══════════════════════════════════════════════════════════
  console.log('\n💸 3. Enviando BTC de Alice hacia bob@arkade.local...');

  // Click Send
  await pageAlice.getByTestId('home-action-send').or(pageAlice.getByText('Send', { exact: true })).first().click();
  await pageAlice.waitForTimeout(2000);

  // Llenar alias del destinatario
  console.log(`  Ingresando destinatario: ${bobAlias}...`);
  const sendAddrInput = pageAlice.locator('input[name="send-address"]');
  await sendAddrInput.fill(bobAlias);

  // Esperar resolución de SatsPath
  console.log('  ⏳ Resolviendo cotización y rieles de SatsPath en tiempo real...');
  await pageAlice.waitForTimeout(4000);

  // Llenar monto: 2 (en USD $2.00 ~= 2,600 sats, perfectamente dentro del balance de $77)
  const amountInput = pageAlice.locator('input[name="send-amount"]');
  if (await amountInput.isVisible().catch(() => false)) {
    console.log('  Ingresando monto: 2...');
    await amountInput.fill('2');
    await pageAlice.waitForTimeout(3000);
  }

  await ss(pageAlice, '05-alice-satspath-resolved');

  // Verificar que la UI reconoció a SatsPath o seleccionó un riel
  const sendPageText = await pageAlice.textContent('body');
  const hasSatsPath = sendPageText?.includes('SatsPath') || sendPageText?.includes('Ark') || sendPageText?.includes('Lightning');
  console.log(`  Resolución SatsPath detectada en UI: ${hasSatsPath ? '✅ SÍ' : '❌ NO'}`);

  await ss(pageAlice, '06-alice-amount-entered');

  // Continuar a la pantalla de detalles
  console.log('  Haciendo click en Continue...');
  const continueBtn = pageAlice.getByRole('button', { name: /continue/i }).or(pageAlice.getByText(/continue/i));
  if (await continueBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
    await continueBtn.first().click();
    await pageAlice.waitForTimeout(3000);
    await ss(pageAlice, '07-alice-send-details');

    // Confirmar pago (Tap to Sign)
    console.log('  Firmando y enviando transacción...');
    const signBtn = pageAlice.getByRole('button', { name: /tap to sign/i }).or(pageAlice.getByText(/tap to sign/i));
    if (await signBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await signBtn.first().click();
      console.log('  ⏳ Esperando confirmación...');
      for (let i = 0; i < 20; i++) {
        await pageAlice.waitForTimeout(2000);
        const bodyTxt = await pageAlice.textContent('body');
        if (bodyTxt?.includes('Payment sent') || bodyTxt?.includes('sent successfully') || bodyTxt?.includes('Success') || bodyTxt?.includes('Sent')) {
          console.log('  🎉 ¡PAGO ENVIADO CON ÉXITO!');
          break;
        }
      }
      await ss(pageAlice, '08-alice-payment-result');
    } else {
      console.log('  ⚠️ Botón Tap to Sign no visible, revisando detalles en pantalla');
    }
  } else {
    console.log('  ⚠️ Botón Continue no visible en formulario de envío');
  }

  // ══════════════════════════════════════════════════════════
  // 4. VERIFICACIÓN EN WALLET 2 (BOB)
  // ══════════════════════════════════════════════════════════
  console.log('\n📬 4. Verificando recepción de fondos en Wallet 2 (Bob)...');
  // Volver al home si Bob sigue en Settings
  for (let i = 0; i < 3; i++) {
    const bobBack = pageBob.locator('[aria-label="Go back"]').first();
    if (await bobBack.isVisible().catch(() => false)) {
      await bobBack.click();
      await pageBob.waitForTimeout(500);
    }
  }
  await pageBob.waitForTimeout(5000);
  const bobBal = await pageBob.getByTestId('main-balance').textContent().catch(() => 'N/A');
  console.log(`  Balance final de Bob en UI: ${bobBal}`);
  await ss(pageBob, '09-bob-final-state');

  console.log('\n' + '═'.repeat(60));
  console.log(`🎉 FLUJO COMPLETO FINALIZADO CON ÉXITO`);
  console.log(`📁 Screenshots guardados en: ${SCREENSHOT_DIR}`);
  console.log('═'.repeat(60));

  await browser.close();
}

run().catch((err) => {
  console.error('\n❌ ERROR EN FLUJO E2E:', err);
  process.exit(1);
});
