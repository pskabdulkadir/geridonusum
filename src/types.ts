/**
 * @file types.ts
 * @description Joint domain data models, structures, and schemas shared between
 * backend automation systems and the cyber-terminal frontend dashboard.
 * 
 * @author Senior Software Architect
 * @license SPDX-License-Identifier: Apache-2.0
 */

export interface TransactionRecord {
  url: string;
  proofHash: string;
  savedGrams: number;
  txHash: string;
  timestamp: string;
}

export interface ReadyToSellItem {
  id: string;
  url: string;
  proofHash: string;
  co2SavingsGrams: number;
  extractedKeywords: string[];
  reportSummary: string;
  marketPriceUSD: number;
  isSold: boolean;
  timestamp: string;
  signature?: string; // Alıcı için hazırlanan voucher imzası
  sellerAddress?: string; // İmzayı atan yetkili cüzdan
  valuationWei?: string; // Kontrat için hassas fiyat verisi (BigNumber string olarak)
}

export interface CoreStats {
  pagesProcessed: number;
  originalSizeTotal: number;
  optimizedSizeTotal: number;
  totalKiloBytesSaved: number;
  totalCo2SavedGrams: number;
  blockchainProofsMinted: number;
  visitedUrls: string[];
  totalEarnings: number;
  transactions: TransactionRecord[];
  isCrawling: boolean;
  currentCrawlingUrl: string;
  readyToSell: ReadyToSellItem[];
  payoutWalletAddress: string;
  autonomousMode: boolean;
  commitThreshold: number;
  // zeroGasModeActive: boolean; // Artık kullanılmıyor
}

export interface OptimizationResult {
  url: string;
  originalSize: number;
  optimizedSize: number;
  bytesSaved: number;
  co2SavingsGrams: number;
  efficiencyGainPct: number;
  proofHash: string;
  optimizedCode: string;
  originalCode: string;
  txHash: string;
  simulated: boolean;
  aiReport?: string; // Optional Gemini-powered semantic review
}

export interface LogEntry {
  id: string;
  timestamp: string;
  module: 'SYSTEM' | 'MARKET' | 'EXECUTOR' | 'BLOCKCHAIN' | 'AI';
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE';
  message: string;
}
