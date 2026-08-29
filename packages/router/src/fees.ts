/**
 * Fee estimation — fetches from mempool.space
 * Mirrors Rust satspath-router/src/fees.rs
 */

import { FeeEstimate } from "./types";

const MEMPOOL_API = "https://mempool.space/api/v1/fees/recommended";

export async function fetchFeeEstimate(): Promise<FeeEstimate> {
  const response = await fetch(MEMPOOL_API);
  if (!response.ok) {
    throw new Error(`Failed to fetch fees: ${response.status}`);
  }
  const data = (await response.json()) as Record<string, number>;
  return {
    fastest_fee: data.fastestFee ?? 5,
    half_hour_fee: data.halfHourFee ?? 4,
    hour_fee: data.hourFee ?? 3,
    economy_fee: data.economyFee ?? 2,
    minimum_fee: data.minimumFee ?? 1,
  };
}

/** Fallback fees for offline/testing */
export const FALLBACK_FEES: FeeEstimate = {
  fastest_fee: 5,
  half_hour_fee: 4,
  hour_fee: 3,
  economy_fee: 2,
  minimum_fee: 1,
};