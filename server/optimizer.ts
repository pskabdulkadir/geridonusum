/**
 * @file optimizer.ts
 * @description Advanced source slimming compiler and mathematical model evaluator in ESM TypeScript.
 * 
 * @author Senior Software Architect
 * @license SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'crypto';

export class DataOptimizer {
  private logCallback?: (module: 'SYSTEM' | 'CRAWLER' | 'OPTIMIZER' | 'BLOCKCHAIN' | 'AI', level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE', msg: string) => void;

  public registerLogger(cb: typeof this.logCallback) {
    this.logCallback = cb;
  }

  private emitLog(module: 'SYSTEM' | 'CRAWLER' | 'OPTIMIZER' | 'BLOCKCHAIN' | 'AI', level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE', msg: string) {
    if (this.logCallback) {
      this.logCallback(module, level, msg);
    }
  }

  /**
   * Cleans HTML payloads by purging source code bloat (comments, duplicate spacing etc)
   */
  public optimizeHtml(rawHtml: string): string {
    if (!rawHtml || typeof rawHtml !== 'string') {
      return '';
    }

    let optimized = rawHtml;

    // 1. Scrub HTML comments
    optimized = optimized.replace(/<!--[\s\S]*?-->/g, '');

    // 2. Scrub inline JS block comments
    optimized = optimized.replace(/\/\*[\s\S]*?\*\//g, '');

    // 3. Scrub single line script comments precisely
    optimized = optimized.replace(/(?<!:|https|http)\/\/.*$/gm, '');

    // 4. Compact consecutive structural spacing inside structural code blocks
    optimized = optimized.replace(/[\s\r\n]+/g, ' ');

    return optimized.trim();
  }

  /**
   * Models the precise Carbon Footprint saved by shedding useless payloads
   */
  public calculateCarbonSavings(originalSize: number, optimizedSize: number, annualTraffic: number) {
    const bytesSaved = Math.max(0, originalSize - optimizedSize);
    
    // Constant multiplier representing internet network energy footprint: 0.0000000112 grams CO2 per byte
    const carbonMultiplier = 0.0000000112;
    const traffic = annualTraffic || 35000;

    const co2SavingsGrams = bytesSaved * carbonMultiplier * traffic;

    return {
      bytesSaved,
      co2SavingsGrams: Number(co2SavingsGrams.toFixed(6)),
      efficiencyGainPct: originalSize > 0 
        ? Number(((bytesSaved / originalSize) * 100).toFixed(2)) 
        : 0
    };
  }

  /**
   * Veritabanına eklenen verinin ticari değerini hesaplar.
   * Puanlama: CO2 Tasarrufu (Ağırlık: %70) + Temizlenen Veri Hacmi (Ağırlık: %30)
   */
  public calculateDataValue(co2Saved: number, bytesSaved: number): number {
    const co2BasePrice = 12.5; // gram başına taban fiyat (Örn: $12.5)
    const byteBasePrice = 0.00005; // byte başına taban fiyat
    
    const value = (co2Saved * co2BasePrice) + (bytesSaved * byteBasePrice);
    // Minimum 1.00 USDT, Maksimum $25.00 bandında normalize et
    return parseFloat(Math.min(25, Math.max(1, value)).toFixed(2));
  }

  /**
   * Mint SHA-256 integrity seal representing the irreversible audit proof of carbon mitigation
   */
  public generateProofHash(targetUrl: string, bytesSaved: number, co2Saved: number, optimizedCode: string): string {
    const struct = JSON.stringify({
      targetUrl,
      bytesSaved,
      co2Saved,
      codeHash: crypto.createHash('md5').update(optimizedCode).digest('hex'),
      epoch: Date.now()
    });

    const hash = crypto.createHash('sha256').update(struct).digest('hex');
    this.emitLog('OPTIMIZER', 'SUCCESS', `Keşfedilen karanlık veriler temizlendi. SHA-256 mühür doğrulaması: 0x${hash.slice(0, 32)}...`);

    return '0x' + hash;
  }
}
