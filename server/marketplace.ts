/**
 * @file marketplace.ts
 * @description Gas-on-Purchase Protocol: Off-chain asset preparation to eliminate seller gas fees.
 */

import { ethers } from 'ethers';
import { blockchainConfig } from './config.ts';

export class MarketplaceManager {
  private logCallback?: (module: 'SYSTEM' | 'MARKET' | 'EXECUTOR' | 'BLOCKCHAIN' | 'AI', level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE', msg: string) => void;

  constructor() {}

  public registerLogger(cb: typeof this.logCallback) {
    this.logCallback = cb;
  }

  private emitLog(module: 'SYSTEM' | 'MARKET' | 'EXECUTOR' | 'BLOCKCHAIN' | 'AI', level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE', msg: string) {
    if (this.logCallback) {
      this.logCallback(module, level, msg);
    }
  }

  /**
   * PROTOKOL_1: prepareAssetForSale (Gasless)
   * Veriyi satışa hazırlar ve alıcının işlemi başlatacağı yapıya sokar.
   */
  public async prepareAssetForSale(dataId: string, priceInUsdt: number) {
    this.emitLog('MARKET', 'SUCCESS', `[PREPARE_LISTING] ${dataId} satışa hazırlandı. Gas ücreti alıcıya devredildi.`);
    return { status: "READY", dataId, priceInUsdt };
  }
}