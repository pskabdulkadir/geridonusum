/**
 * @file marketplace.ts
 * @description Autonomous Marketplace Listing Protocol for On-Chain Data Assets.
 */

import { ethers } from 'ethers';
import { blockchainConfig } from './config.ts';

export class MarketplaceManager {
  private abi = [
    "function listAsset(bytes32 id, uint256 price) public returns (bool)",
    "function getAsset(bytes32 id) public view returns (address owner, uint256 price, bool isSold)"
  ];

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
   * PROTOKOL_1: RegisterListing
   * Varlığı akıllı kontrat üzerinde satışa sunar.
   */
  public async listAssetOnMarket(dataId: string, priceInUsdt: number): Promise<string | null> {
    try {
      if (!blockchainConfig.privateKey || blockchainConfig.privateKey.includes('YOUR_PRIVATE_KEY')) {
        this.emitLog('BLOCKCHAIN', 'ERROR', "[MARKET] Listeleme durduruldu: PRIVATE_KEY eksik.");
        return null;
      }

      const provider = new ethers.providers.JsonRpcProvider(blockchainConfig.rpcUrl);
      const wallet = new ethers.Wallet(blockchainConfig.privateKey, provider);
      const contract = new ethers.Contract(blockchainConfig.contractAddress, this.abi, wallet);

      // USDT değerini blokzinciri hassasiyetine (18 decimal) çevir
      const priceWei = ethers.utils.parseUnits(priceInUsdt.toFixed(18), 18);
      const idBytes32 = ethers.utils.formatBytes32String(dataId);

      this.emitLog('BLOCKCHAIN', 'INFO', `[MARKET_LISTING] Varlık kontrata iletiliyor: ${dataId} ($${priceInUsdt})`);

      const tx = await contract.listAsset(idBytes32, priceWei, {
        gasLimit: 120000 
      });

      const receipt = await tx.wait();
      return receipt.transactionHash;
    } catch (error: any) {
      this.emitLog('BLOCKCHAIN', 'ERROR', `[MARKET_ERROR] Listeleme başarısız: ${error.message}`);
      return null;
    }
  }
}