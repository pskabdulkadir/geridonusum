/**
 * @file blockchain.ts
 * @description Decoupled production-ready EVM ledger transaction gateway in ESM TypeScript.
 * 
 * @author Senior Software Architect
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { ethers } from 'ethers';
import * as crypto from 'crypto';
import { blockchainConfig } from './config.ts';

export class BlockchainRouter {
  public rpcUrl: string;
  public rpcEndpoints: string[];
  public privateKey: string;
  public contractAddress: string;
  private isRealMode: boolean = false;

  private gasThresholds = {
    polygon: "2.0", // MATIC/POL
    bsc: "0.005"   // BNB
  };

  private logCallback?: (module: 'SYSTEM' | 'CRAWLER' | 'OPTIMIZER' | 'BLOCKCHAIN' | 'AI', level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE', msg: string) => void;

  // Mint function definition support including submitted CarbonHarvester contract requested by user
  private contractAbi = [
    "function mintAndSwap(uint256 amount, string memory proof) public returns (bool)",
    "function submitProof(bytes32 proofHash, uint256 amount) external returns (bool)"
  ];

  constructor(options: { rpcUrl?: string; privateKey?: string; contractAddress?: string } = {}) {
    let rpc = options.rpcUrl || blockchainConfig.rpcUrl;
    let pkey = options.privateKey || blockchainConfig.privateKey;
    let contract = options.contractAddress || blockchainConfig.contractAddress;

    if (pkey && !pkey.startsWith('0x')) {
      pkey = '0x' + pkey;
    }

    // Sanitize contract address
    if (!contract || 
        contract.includes('0x000000000000000000000000') || 
        contract === 'YOUR_CONTRACT_ADDRESS') {
      contract = ethers.constants.AddressZero;
    }

    this.rpcEndpoints = Array.from(new Set([
      rpc,
      'https://polygon-rpc.com',
      'https://polygon-mainnet.g.alchemy.com/v2/G-qA0bZx-DU57eXe83q8e',
      'https://rpc.ankr.com/polygon',
      'https://polygon.llamarpc.com',
      'https://1rpc.io/matic',
      'https://polygon-mainnet.public.blastapi.io'
    ].filter(Boolean)));

    this.rpcUrl = this.rpcEndpoints[0];
    this.privateKey = pkey;
    this.contractAddress = contract;

    // ÜRETİM MODU ZORUNLULUĞU: Simülasyon kapıları kalıcı olarak kapatıldı.
    if (!this.privateKey || this.privateKey.includes('YOUR_PRIVATE_KEY')) {
      this.emitLog('BLOCKCHAIN', 'ERROR', "KRITIK: PRIVATE_KEY eksik veya hatalı! Sistem gerçek işlem yapamaz. Lütfen .env dosyasını kontrol edin.");
      this.isRealMode = false;
    } else {
      this.isRealMode = true;
    }
  }

  public registerLogger(cb: typeof this.logCallback) {
    this.logCallback = cb;
  }

  /**
   * Cüzdan adresini döndür (PRIVATE_KEY'den türetilmiş)
   */
  public getWalletAddress(): string {
    if (!this.privateKey || this.privateKey.includes('0xtest')) {
      return "";
    }
    try {
      const wallet = new ethers.Wallet(this.privateKey);
      return wallet.address;
    } catch {
      return "";
    }
  }

  private emitLog(module: 'SYSTEM' | 'CRAWLER' | 'OPTIMIZER' | 'BLOCKCHAIN' | 'AI', level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE', msg: string) {
    // GÜVENLİK FİLTRESİ: Loglarda asla private key geçmemeli
    if (this.privateKey && msg.includes(this.privateKey)) {
      msg = msg.replace(this.privateKey, "***GIZLI_ANAHTAR***");
    }
    // GÜVENLİK FİLTRESİ: Loglarda APP_URL geçmemeli
    if (blockchainConfig.appUrl && msg.includes(blockchainConfig.appUrl)) {
      msg = msg.replace(blockchainConfig.appUrl, "***APP_URL***");
    }
    // Cüzdan adresini kısaltarak logla (0x123...abcd)
    if (this.privateKey && msg.includes(this.privateKey)) {
        msg = msg.replace(this.privateKey, "SECRET_KEY");
    }
    if (this.logCallback) {
      this.logCallback(module, level, msg);
    }
  }

  /**
   * Blokzinciri hatalarını kullanıcı dostu Türkçe mesajlara dönüştürür.
   */
  private parseBlockchainError(err: any): string {
    const message = err?.message || String(err);
    if (message.includes('insufficient funds')) return "Cüzdanda gas ücreti için yetersiz bakiye (POL/BNB eksik).";
    if (message.includes('nonce too low')) return "Ağda bekleyen başka bir işlem var, lütfen bekleyin.";
    if (message.includes('replacement transaction underpriced')) return "İşlem ücreti çok düşük, ağ kabul etmedi.";
    if (message.includes('user rejected')) return "İşlem kullanıcı tarafından reddedildi.";
    if (message.includes('execution reverted')) return "Akıllı kontrat işlemi reddetti; koşullar sağlanmamış olabilir.";
    if (message.includes('timeout') || message.includes('ETIMEDOUT')) return "İşlem ağ yoğunluğu nedeniyle zaman aşımına uğradı.";
    return "İşlem ağ hatası nedeniyle başarısız oldu, lütfen tekrar deneyin.";
  }

  /**
   * Cüzdan bakiyesini kontrol eder ve üretim modu için kritik eşik uyarısı verir.
   * Bu fonksiyon, ödeme emri öncesinde sistemin gas ücretini karşılayıp karşılayamayacağını denetler.
   */
  public async checkGasBalance(network: 'polygon' | 'bsc' = 'bsc'): Promise<{ balance: string, isLow: boolean }> {
    try {
      // Ağ tipine göre uygun RPC terminalini seç (BSC veya Polygon)
      const rpc = network === 'bsc' ? 'https://bsc-dataseed.binance.org/' : (this.rpcUrl || 'https://polygon-rpc.com');
      const provider = new ethers.providers.JsonRpcProvider(rpc);
      const wallet = new ethers.Wallet(this.privateKey, provider);
      
      const balance = await provider.getBalance(wallet.address);
      const balanceInEther = ethers.utils.formatEther(balance);
      
      const threshold = network === 'bsc' ? this.gasThresholds.bsc : this.gasThresholds.polygon;
      const isLow = parseFloat(balanceInEther) < parseFloat(threshold);

      if (isLow) {
        this.emitLog('BLOCKCHAIN', 'WARNING', `DİKKAT: Üretim bakiyesi düşük (${balanceInEther} ${network === 'bsc' ? 'BNB' : 'POL'}). İşlem sürekliliği için bakiye ekleyin.`);
      }
      return { balance: balanceInEther, isLow };
    } catch (err) {
      throw new Error("BLOCKCHAIN_CONNECTIVITY_LOST: On-chain bakiye sorgulanamadı.");
    }
  }

  /**
   * PROTOKOL_REAL: EIP-712 Standartlarında yapılandırılmış satış emri imzalar.
   * Bu imza, alıcı tarafından 'buyAsset' fonksiyonunda kullanılır.
   */
  public async createSignedSaleOrder(itemId: string, co2SavingsGrams: number, price: number): Promise<string> {
    this.emitLog('BLOCKCHAIN', 'INFO', `[EIP-712] Satış emri mühürleniyor: ${itemId}...`);
    
    try {
      // Cüzdanı provider olmadan başlat (Signing işlemi için bağlantı gerekmez, noNetwork hatasını önler)
      const wallet = new ethers.Wallet(this.privateKey);

      // Domain Separator (Kontrat ile eşleşmeli)
      const domain = {
        name: "InternetReclamationMarket",
        version: "1",
        chainId: 137, // Polygon Mainnet (Dinamik sorgu NETWORK_ERROR riskini önlemek için sabitlendi)
        verifyingContract: this.contractAddress
      };

      // Veri Yapısı (Types)
      const types = {
        AssetSale: [
          { name: "id", type: "string" },
          { name: "price", type: "uint256" },
          { name: "seller", type: "address" }
        ]
      };

      // Veri (Value)
      const value = {
        id: itemId,
        price: ethers.utils.parseUnits(price.toFixed(18), 18), // Fiyatı Wei'ye çevir
        seller: wallet.address
      };

      const signature = await wallet._signTypedData(domain, types, value);
      this.emitLog('BLOCKCHAIN', 'SUCCESS', `[VOUCHER_OK] Dijital mühür başarıyla oluşturuldu.`);
      return signature;
    } catch (err: any) {
      throw new Error(`EIP-712 imzalama hatası: ${err.message}`);
    }
  }

  /**
   * [DEPRECATED] executeRealSale artık Gas-on-Purchase modeli nedeniyle kullanılmamaktadır.
   * Bu fonksiyon, satıcının doğrudan gas ödediği transferler için tasarlanmıştır.
   */
  public async executeRealSale(amountStr: string): Promise<string> {
    this.emitLog('BLOCKCHAIN', 'WARNING', `[DEPRECATED] executeRealSale fonksiyonu çağrıldı ancak pasif. Yeni protokol: Gas-on-Purchase.`);
    throw new Error("DEPRECATED: executeRealSale is no longer used in Gas-on-Purchase model.");
  }

  /**
   * Dispatches immutable parameters onto the target L2/Core blockchain network.
   */
  public async triggerBorsaSwap(carbonGram: number, proofHash: string): Promise<{ success: boolean; txHash: string; simulated: boolean; error?: string }> {
    this.emitLog('BLOCKCHAIN', 'INFO', `Blokzinciri ağ geçidi hazırlanıyor...`);

    let lastError: any = null;
    for (let i = 0; i < this.rpcEndpoints.length; i++) {
      const currentRpc = this.rpcEndpoints[i];
      try {
        this.emitLog('BLOCKCHAIN', 'INFO', `Ağa bağlanılıyor [${i + 1}/${this.rpcEndpoints.length}]: ${currentRpc}`);
        
        const provider = new ethers.providers.JsonRpcProvider({
          url: currentRpc,
          timeout: 10000 // 502 hatalarını önlemek için zaman aşımı
        });
        
        // Load and verify security keys
        const wallet = new ethers.Wallet(this.privateKey, provider);
        if (!this.privateKey || this.privateKey.includes('YOUR_PRIVATE_KEY')) {
          const errMsg = "HATA: Geçerli bir PRIVATE_KEY (Özel Anahtar) gereklidir. İşlem durduruldu.";
          this.emitLog('BLOCKCHAIN', 'ERROR', errMsg);
          return { success: false, txHash: '', simulated: false, error: errMsg };
        }

        const balance = await provider.getBalance(wallet.address).catch(() => ethers.BigNumber.from(0));
        
        if (balance.isZero() && this.isRealMode) {
          this.emitLog('BLOCKCHAIN', 'ERROR', `Cüzdan Bakiyesi 0 POL. İşlem yapılamaz. Lütfen ${wallet.address} adresine POL gönderin.`);
          return { success: false, txHash: '', simulated: false, error: 'Yetersiz bakiye' };
        }
        this.emitLog('BLOCKCHAIN', 'INFO', `Sıcak cüzdan doğrulandı: ${wallet.address} | Bakiye: ${ethers.utils.formatEther(balance)} MATIC/POL`);

        // Check if contract is zero-address to trigger Direct Proof anchoring on-chain
        const isZeroContract = this.contractAddress === ethers.constants.AddressZero;

        if (isZeroContract) {
          this.emitLog('BLOCKCHAIN', 'INFO', `Akıllı kontrat adresi belirtilmedi. Yeşil karbon kanıtı doğrudan Polygon üzerinde mühürleniyor (Memo mod)...`);

          const memoMessage = `CARBON_PROOF:${proofHash}:${carbonGram.toFixed(4)}_CO2_g`;
          const memoBytes = ethers.utils.hexlify(ethers.utils.toUtf8Bytes(memoMessage));

          const tx = await wallet.sendTransaction({
            to: wallet.address, // Self-transaction safely stores immutable record
            value: ethers.utils.parseEther("0"),
            data: memoBytes,
            gasLimit: 30000
          });

          this.emitLog('BLOCKCHAIN', 'INFO', `Kanıt işlemi ağa başarıyla iletildi. Blok onayı bekleniyor... İşlem Kodu: ${tx.hash}`);
          const receipt = await tx.wait();

          this.emitLog('BLOCKCHAIN', 'SUCCESS', `${receipt.blockNumber} numaralı blok onaylandı. Yeşil Karbon proof kaydı blok zincirine eklendi. Harcanan Gas: ${receipt.gasUsed.toString()}`);

          return {
            success: true,
            txHash: tx.hash,
            simulated: false
          };
        } else {
          // Contract execution
          const contract = new ethers.Contract(this.contractAddress, this.contractAbi, wallet);
          // Veriyi kontratın beklediği birime (18 decimal) çevir
          const amountWei = ethers.utils.parseUnits(carbonGram.toFixed(18), 18);

          this.emitLog('BLOCKCHAIN', 'INFO', `Temizlik kanıtı işlemi akıllı kontrat üzerinde başlatılıyor...`);
          
          let tx;
          try {
            this.emitLog('BLOCKCHAIN', 'INFO', `Deneme 1: mintAndSwap fonksiyonu çağrılıyor...`);
            tx = await contract.mintAndSwap(amountWei, proofHash, {
              gasLimit: 150000
            });
          } catch (firstErr: any) {
            this.emitLog('BLOCKCHAIN', 'WARNING', `mintAndSwap başarısız oldu: ${firstErr.message}. Deneme 2: submitProof çağrılıyor...`);
            // Ensure proofHash matches bytes32 for standard submitProof require signature
            let bytes32Proof = proofHash;
            if (!bytes32Proof.startsWith('0x')) {
              bytes32Proof = '0x' + bytes32Proof;
            }
            if (bytes32Proof.length < 66) {
              bytes32Proof = bytes32Proof.padEnd(66, '0');
            } else if (bytes32Proof.length > 66) {
              bytes32Proof = bytes32Proof.substring(0, 66);
            }
            
            // submitProof (bytes32 proofHash, uint256 amount)
            tx = await contract.submitProof(bytes32Proof, amountWei, {
              gasLimit: 150000
            });
          }

          this.emitLog('BLOCKCHAIN', 'INFO', `Ağa başarıyla iletildi. Blok onayı bekleniyor... İşlem Kodu: ${tx.hash}`);
          const receipt = await tx.wait();

          this.emitLog('BLOCKCHAIN', 'SUCCESS', `${receipt.blockNumber} numaralı blok onaylandı. Yeşil kredi takas edildi ve kaydedildi. Harcanan Gas: ${receipt.gasUsed.toString()}`);

          return {
            success: true,
            txHash: tx.hash,
            simulated: false
          };
        }
      } catch (e: any) {
        lastError = e;
        this.emitLog('BLOCKCHAIN', 'WARNING', `RPC hatası (${currentRpc}): ${this.parseBlockchainError(e)}`);
      }
    }

    this.emitLog('BLOCKCHAIN', 'ERROR', `Mevcut tüm RPC sunucuları başarısız oldu. İşlem durduruldu.`);
    return {
      success: false,
      txHash: '',
      simulated: false,
      error: this.parseBlockchainError(lastError)
    };
  }

  /**
   * Binance Smart Chain (BSC) ağı üzerinde gerçek BNB transferi gerçekleştirir.
   * Eğer PRIVATE_KEY tanımlı değilse veya geçersizse otomatik olarak simüle edilmiş test kaydına geçer.
   */
  public async executeBscPayout(toAddress: string, bnbAmountStr: string = "0.0005"): Promise<{ success: boolean; txHash: string; simulated: boolean; error?: string }> {
    this.emitLog('BLOCKCHAIN', 'INFO', `Binance Smart Chain (BSC) üzerinden otonom gelir transferi başlatılıyor...`);

    // Alıcı adresi doğrulaması
    if (!toAddress || !ethers.utils.isAddress(toAddress)) {
      this.emitLog('BLOCKCHAIN', 'ERROR', `Geçersiz alıcı cüzdan adresi: ${toAddress}`);
      return { success: false, txHash: '', simulated: false, error: 'Invalid destination address' };
    }

    // Özel anahtarın mevcut ve geçerli olduğunu kontrol et
    const pkey = this.privateKey;
    const bscRpcEndpoints = ['https://bsc-dataseed.binance.org/', 'https://rpc.ankr.com/bsc', 'https://binance.llamarpc.com'];
    let payoutError: any = null;

    for (const bscRpc of bscRpcEndpoints) {
      try {
        this.emitLog('BLOCKCHAIN', 'INFO', `BSC ağına bağlanılıyor: ${bscRpc}`);

        const provider = new ethers.providers.JsonRpcProvider({ url: bscRpc, timeout: 10000 });
        const wallet = new ethers.Wallet(pkey, provider);
        if (!pkey || pkey.includes('YOUR_PRIVATE_KEY')) {
          const errMsg = "HATA: Gerçek gelir transferi için geçerli bir PRIVATE_KEY tanımlanmalıdır.";
          this.emitLog('BLOCKCHAIN', 'ERROR', errMsg);
          return { success: false, txHash: '', simulated: false, error: errMsg };
        }

        const balance = await provider.getBalance(wallet.address);
        const amountWei = ethers.utils.parseEther(bnbAmountStr);

        // Bakiye ve gas için küçük bir marj bırak (safety buffer)
        if (balance.lt(amountWei.add(ethers.utils.parseEther("0.0005")))) {
          throw new Error("insufficient funds");
        }

        this.emitLog('BLOCKCHAIN', 'INFO', `${toAddress} cüzdanına ${bnbAmountStr} BNB gönderiliyor...`);
        
        const tx = await wallet.sendTransaction({
          to: toAddress,
          value: amountWei,
          gasLimit: 21000
        });

        const receipt = await tx.wait();
        this.emitLog('BLOCKCHAIN', 'SUCCESS', `Gelir gerçek BSC ağı üzerinden iletildi! Hash: ${tx.hash}`);

        return {
          success: true,
          txHash: tx.hash,
          simulated: false
        };
      } catch (err: any) {
        payoutError = err;
        this.emitLog('BLOCKCHAIN', 'WARNING', `BSC RPC hatası (${bscRpc}): ${this.parseBlockchainError(err)}`);
        continue;
      }
    }

    return { success: false, txHash: '', simulated: false, error: this.parseBlockchainError(payoutError) };
  }
}
