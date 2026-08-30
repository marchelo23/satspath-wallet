/* tslint:disable */
/* eslint-disable */

/**
 * BIP-353 DNS resolver using DNS-over-HTTPS
 */
export class Bip353Resolver {
    free(): void;
    [Symbol.dispose](): void;
    constructor();
    resolve_alias_async(alias: string): Promise<string>;
    with_policy(policy: string): Bip353Resolver;
}

/**
 * Chain resolver that tries resolvers in order
 */
export class ChainResolver {
    free(): void;
    [Symbol.dispose](): void;
    constructor();
    /**
     * Resolve an alias to a signed payment profile (returns JSON string)
     */
    resolve_alias(alias: string): Promise<string>;
    readonly local_registry: LocalRegistry;
}

/**
 * HTTPS Well-known resolver (/.well-known/satspath/{alias}.json)
 */
export class HttpsWellKnownResolver {
    free(): void;
    [Symbol.dispose](): void;
    constructor();
    resolve_alias_async(alias: string): Promise<string>;
}

export class HybridIdentityKeypair {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly classical_pubkey_hex: string;
    readonly classical_secret_key_hex: string;
    readonly pqc_seed_hex: string;
    readonly pqc_verification_key_hex: string;
}

export class IdentityKeypair {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly pubkey_hex: string;
    readonly secret_key_hex: string;
}

/**
 * Local in-memory registry
 */
export class LocalRegistry {
    free(): void;
    [Symbol.dispose](): void;
    add_profile(profile_json: string): void;
    list_profiles(): string[];
    constructor();
    resolve_alias(alias: string): Promise<string>;
}

/**
 * Nostr NIP-05 resolver
 */
export class NostrNip05Resolver {
    free(): void;
    [Symbol.dispose](): void;
    constructor();
    resolve_alias_async(alias: string): Promise<string>;
}

/**
 * Return the canonical UTF-8 JSON bytes of a profile JSON string.
 *
 * Same as `satspath-core::crypto::canonical_profile_bytes` but callable from JS.
 * Returns an empty `Uint8Array` on parse/serialization error.
 */
export function canonical_profile_json(profile_json: string): Uint8Array;

/**
 * Derive a deterministic secp256k1 identity keypair from wallet seed bytes.
 */
export function derive_identity_keypair_from_seed(seed: Uint8Array, account_index: number): IdentityKeypair | undefined;

/**
 * Compute the 8-char fingerprint of a compressed secp256k1 pubkey.
 *
 * Returns the first 8 hex characters (matching Rust `fingerprint_pubkey`).
 * Returns empty string on invalid input.
 */
export function fingerprint_pubkey(pubkey_hex: string): string;

/**
 * Generate a fresh hybrid keypair for the identity.
 */
export function generate_hybrid_identity_keypair(): HybridIdentityKeypair;

/**
 * Generate a fresh secp256k1 keypair for the identity.
 */
export function generate_identity_keypair(): IdentityKeypair;

/**
 * Initialize the WASM module (better panic messages in JS console).
 * Call once at startup in Node.js: `init()`.
 */
export function main(): void;

export function quote(recipient: string, amount_sats: number): Promise<any>;

/**
 * Sign a canonical JSON profile using Hybrid Signature (Schnorr + ML-DSA).
 * Returns a JSON string of the `HybridSignature` object, or empty string on error.
 */
export function sign_hybrid_profile_json(profile_json: string, classical_sk_hex: string, pqc_seed_hex: string): string;

/**
 * Sign a canonical JSON profile using Schnorr.
 * Takes the profile JSON and the secret key hex.
 * Returns the signature in hex.
 */
export function sign_profile_json(profile_json: string, secret_key_hex: string): string;

/**
 * Derive the 32-byte Hyperswarm/HyperDHT topic for a SatsPath alias.
 *
 * Returns a `Uint8Array` of 32 bytes in JS.
 *
 * Matches `topicForAlias(alias)` in `topic.js`:
 * ```js
 * sha256(new TextEncoder().encode("satspath:p2p:v1:" + alias.trim().toLowerCase()))
 * ```
 *
 * # Example (Node.js)
 * ```js
 * import { topic_for_alias } from './pkg/satspath_wasm.js';
 * const topic = Buffer.from(topic_for_alias("rodrigo@satspath.dev"));
 * swarm.join(topic, { server: true, client: false });
 * ```
 */
export function topic_for_alias(alias: string): Uint8Array;

/**
 * Verify a SatsPath `SignedPaymentProfile` passed as a JSON string.
 *
 * Returns `true` only if the secp256k1 Schnorr signature is valid for the
 * profile's `identity_pubkey`. Returns `false` on any error — never throws.
 *
 * Algorithm (matches Protocol v0.1 §12 / satspath-core):
 *   digest = SHA-256("SatsPathProfileV1" || canonical_json(profile))
 *   verify Schnorr(sig, digest, identity_pubkey)
 *
 * Also attempts legacy fallback (insertion-order JSON, no domain separator)
 * for profiles signed by very early satspath-core versions using ECDSA.
 */
export function verify_signed_profile(signed_json: string): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_bip353resolver_free: (a: number, b: number) => void;
    readonly __wbg_chainresolver_free: (a: number, b: number) => void;
    readonly __wbg_httpswellknownresolver_free: (a: number, b: number) => void;
    readonly __wbg_localregistry_free: (a: number, b: number) => void;
    readonly __wbg_nostrnip05resolver_free: (a: number, b: number) => void;
    readonly bip353resolver_new: () => number;
    readonly bip353resolver_resolve_alias_async: (a: number, b: number, c: number) => any;
    readonly bip353resolver_with_policy: (a: number, b: number, c: number) => number;
    readonly chainresolver_local_registry: (a: number) => number;
    readonly chainresolver_new: () => number;
    readonly chainresolver_resolve_alias: (a: number, b: number, c: number) => any;
    readonly httpswellknownresolver_resolve_alias_async: (a: number, b: number, c: number) => any;
    readonly localregistry_add_profile: (a: number, b: number, c: number) => [number, number];
    readonly localregistry_list_profiles: (a: number) => [number, number];
    readonly localregistry_new: () => number;
    readonly localregistry_resolve_alias: (a: number, b: number, c: number) => any;
    readonly nostrnip05resolver_new: () => number;
    readonly nostrnip05resolver_resolve_alias_async: (a: number, b: number, c: number) => any;
    readonly httpswellknownresolver_new: () => number;
    readonly __wbg_hybrididentitykeypair_free: (a: number, b: number) => void;
    readonly __wbg_identitykeypair_free: (a: number, b: number) => void;
    readonly canonical_profile_json: (a: number, b: number) => [number, number];
    readonly derive_identity_keypair_from_seed: (a: number, b: number, c: number) => number;
    readonly fingerprint_pubkey: (a: number, b: number) => [number, number];
    readonly generate_hybrid_identity_keypair: () => number;
    readonly generate_identity_keypair: () => number;
    readonly hybrididentitykeypair_classical_pubkey_hex: (a: number) => [number, number];
    readonly hybrididentitykeypair_classical_secret_key_hex: (a: number) => [number, number];
    readonly hybrididentitykeypair_pqc_seed_hex: (a: number) => [number, number];
    readonly hybrididentitykeypair_pqc_verification_key_hex: (a: number) => [number, number];
    readonly identitykeypair_pubkey_hex: (a: number) => [number, number];
    readonly identitykeypair_secret_key_hex: (a: number) => [number, number];
    readonly sign_hybrid_profile_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly sign_profile_json: (a: number, b: number, c: number, d: number) => [number, number];
    readonly verify_signed_profile: (a: number, b: number) => number;
    readonly main: () => void;
    readonly topic_for_alias: (a: number, b: number) => [number, number];
    readonly quote: (a: number, b: number, c: number) => any;
    readonly rustsecp256k1_v0_10_0_default_error_callback_fn: (a: number, b: number) => void;
    readonly rustsecp256k1_v0_10_0_default_illegal_callback_fn: (a: number, b: number) => void;
    readonly rustsecp256k1_v0_10_0_context_destroy: (a: number) => void;
    readonly rustsecp256k1_v0_10_0_context_create: (a: number) => number;
    readonly wasm_bindgen_122faa080f9d5875___convert__closures_____invoke___wasm_bindgen_122faa080f9d5875___JsValue__core_9b3796e30d99ddb7___result__Result_____wasm_bindgen_122faa080f9d5875___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_122faa080f9d5875___convert__closures_____invoke___js_sys_5afca8a72b69d95c___Function_fn_wasm_bindgen_122faa080f9d5875___JsValue_____wasm_bindgen_122faa080f9d5875___sys__Undefined___js_sys_5afca8a72b69d95c___Function_fn_wasm_bindgen_122faa080f9d5875___JsValue_____wasm_bindgen_122faa080f9d5875___sys__Undefined_______true_: (a: number, b: number, c: any, d: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
