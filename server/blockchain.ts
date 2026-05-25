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
    polygon: "0.5", // MATIC/POL (Daha gerçekçi bir eşik)
    bsc: "0.005"   // BNB
  };

  private logCallback?: (module: 'SYSTEM' | 'CRAWLER' | 'OPTIMIZER' | 'BLOCKCHAIN' | 'AI', level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE', msg: string) => void;

  // Mint function definition support including submitted CarbonHarvester contract requested by user
  private contractAbi = [
    "function registerDataAsset(uint256 amount, string memory proof) public returns (bool)", // Mint yerine register
    "function submitProof(bytes32 proofHash, uint256 amount) external returns (bool)"
  ];

  constructor(options: { rpcUrl?: string; privateKey?: string; contractAddress?: string } = {}) {
    let rpc = options.rpcUrl || blockchainConfig.rpcUrl;
    let pkey = options.privateKey || blockchainConfig.privateKey;
    let contract = options.contractAddress || blockchainConfig.contractAddress;

    if (pkey && !pkey.startsWith('0x')) { // PRIVATE_KEY'in 0x ile başladığından emin ol
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
      'https://polygon.llamarpc.com',
      'https://polygon-mainnet.g.alchemy.com/v2/G-qA0bZx-DU57eXe83q8e',
      'https://rpc.ankr.com/polygon',
      'https://1rpc.io/matic',
      'https://polygon-mainnet.public.blastapi.io'
    ].filter(Boolean)));

    this.rpcUrl = this.rpcEndpoints[0];
    this.privateKey = pkey;
    this.contractAddress = contract;

    // ÜRETİM MODU DOĞRULAMASI: Cüzdanın geçerliliğini kontrol et
    try {
      if (!this.privateKey || this.privateKey.includes('YOUR_PRIVATE_KEY') || this.privateKey.includes('0xtest')) {
        throw new Error("Invalid private key placeholder");
      }
      this.isRealMode = true;
    } catch (err) {
      this.emitLog('BLOCKCHAIN', 'ERROR', "KRITIK: PRIVATE_KEY eksik veya geçersiz! Sistem gerçek işlem yapamaz. Lütfen .env dosyasını kontrol edin.");
      this.isRealMode = false;
    }
  }

  public async validateOnChainStatus() { // Metodu public yaptık
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const provider = new ethers.providers.JsonRpcProvider({
          url: this.rpcUrl,
          skipFetchSetup: true // NoNetwork hatasını azaltmaya yardımcı olur
        });

        // Ağın hazır olmasını bekle
        await provider.ready;
        await provider.getNetwork();

        // Eğer kontrat adresi sıfır değilse, deploy durumunu kontrol et
        if (this.contractAddress && this.contractAddress !== ethers.constants.AddressZero) {
          const code = await provider.getCode(this.contractAddress);
          if (code === "0x") {
            this.emitLog('BLOCKCHAIN', 'ERROR', `KRITIK: ${this.contractAddress} adresinde kontrat bulunamadı!`);
          } else {
            this.emitLog('BLOCKCHAIN', 'SUCCESS', `Sözleşme doğrulandı: ${this.contractAddress}`);
          }
        }
        return; // Başarılıysa döngüden çık
      } catch (err: any) {
        attempts++;
        this.emitLog('BLOCKCHAIN', 'WARNING', `Ağ bağlantı denemesi ${attempts}/${maxAttempts} başarısız: ${err.message}`);
        if (attempts < maxAttempts) await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    this.emitLog('BLOCKCHAIN', 'ERROR', "KRITIK: Ağ algılanamadı (noNetwork). RPC ayarlarını kontrol edin.");
  }

  public registerLogger(cb: typeof this.logCallback) {
    this.logCallback = cb;
  }

  /**
   * Cüzdan adresini döndür (PRIVATE_KEY'den türetilmiş)
   */
  public getWalletAddress(): string {
    try {
      if (!this.privateKey || this.privateKey.includes('0xtest') || this.privateKey.includes('YOUR_PRIVATE_KEY')) {
        return "";
      }
      const wallet = new ethers.Wallet(this.privateKey);
      return wallet.address;
    } catch {
      return "";
    }
  }

  private emitLog(module: 'SYSTEM' | 'CRAWLER' | 'OPTIMIZER' | 'BLOCKCHAIN' | 'AI' | 'FINANCE', level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE', msg: string) {
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
      // Render 502 hatalarını önlemek için kesin zaman aşımı (Timeout) ekle
      const provider = new ethers.providers.JsonRpcProvider({
        url: rpc,
        timeout: 8000 // 8 saniye içinde cevap gelmezse iptal et
      });
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
      // HATA KORUMASI: RPC hatası 500 döndürmemeli, sadece bakiyeyi 0 göstermeli
      return { balance: "0.000000", isLow: true };
    }
  }

  /**
   * PROTOKOL_REAL: EIP-712 Standartlarında yapılandırılmış satış emri imzalar.
   * Bu imza, alıcı tarafından 'buyAsset' fonksiyonunda kullanılır.
   */
  public async createSignedAccessVoucher(dataAssetId: string, co2AnalysisGrams: number, accessPrice: number): Promise<string> {
    this.emitLog('BLOCKCHAIN', 'INFO', `[EIP-712] Veri erişim voucheri imzalanıyor: ${dataAssetId}...`);
    
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
        DataAssetAccess: [ // AssetSale yerine DataAssetAccess
          { name: "id", type: "string" },
          { name: "accessFee", type: "uint256" }, // price yerine accessFee
          { name: "publisher", type: "address" } // seller yerine publisher
        ]
      };

      // Veri (Value)
      const value = {
        id: dataAssetId,
        accessFee: ethers.utils.parseUnits((accessPrice || 0).toFixed(18), 18), // Fiyatı Wei'ye çevir (Safety check eklendi)
        publisher: wallet.address // seller yerine publisher
      };

      const signature = await wallet._signTypedData(domain, types, value);
      
      // AUDIT: İmza Geçerlilik Denetimi (EIP-712 Standardı)
      const recoveredAddress = ethers.utils.verifyTypedData(domain, types, value, signature);
      const isAuthentic = recoveredAddress.toLowerCase() === wallet.address.toLowerCase();

      this.emitLog('BLOCKCHAIN', 'SUCCESS', `[VOUCHER_OK] Mühür mülkiyeti doğrulandı: ${isAuthentic ? 'GEÇERLİ (VALID)' : 'GEÇERSİZ'}`);
      this.emitLog('BLOCKCHAIN', 'ANALYZE', `[TRACE] Recovered Signer: ${recoveredAddress.slice(0, 10)}...`);
      
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
  public async submitDataInsightProof(co2AnalysisGrams: number, proofHash: string): Promise<{ success: boolean; txHash: string; simulated: boolean; error?: string }> {
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
          this.emitLog('BLOCKCHAIN', 'INFO', `Akıllı kontrat adresi belirtilmedi. Veri analitiği kanıtı doğrudan Polygon üzerinde mühürleniyor (Memo mod)...`);

          const memoMessage = `DATA_INSIGHT_PROOF:${proofHash}:${co2AnalysisGrams.toFixed(4)}_CO2_g_ANALYSIS`;
          const memoBytes = ethers.utils.hexlify(ethers.utils.toUtf8Bytes(memoMessage));

          const tx = await wallet.sendTransaction({
            to: wallet.address, // Self-transaction safely stores immutable record
            value: ethers.utils.parseEther("0"),
            data: memoBytes,
            gasLimit: 30000
          });

          this.emitLog('BLOCKCHAIN', 'INFO', `Veri analitiği kanıt işlemi ağa başarıyla iletildi. Blok onayı bekleniyor... İşlem Kodu: ${tx.hash}`);
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
          // Analiz değerini kontratın beklediği birime (18 decimal) çevir
          const amountWei = ethers.utils.parseUnits(co2AnalysisGrams.toFixed(18), 18);

          this.emitLog('BLOCKCHAIN', 'INFO', `Veri analitiği kanıt işlemi akıllı kontrat üzerinde başlatılıyor...`);
          
          let tx;
          try {
            this.emitLog('BLOCKCHAIN', 'INFO', `Deneme 1: registerDataAsset fonksiyonu çağrılıyor...`);
            tx = await contract.registerDataAsset(amountWei, proofHash, {
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
            tx = await contract.submitProof(bytes32Proof, amountWei, { // submitProof hala geçerli
              gasLimit: 150000
            });
          }

          this.emitLog('BLOCKCHAIN', 'INFO', `Ağa başarıyla iletildi. Blok onayı bekleniyor... İşlem Kodu: ${tx.hash}`);
          const receipt = await tx.wait();

          this.emitLog('BLOCKCHAIN', 'SUCCESS', `${receipt.blockNumber} numaralı blok onaylandı. Veri analitiği kaydı blok zincirine eklendi. Harcanan Gas: ${receipt.gasUsed.toString()}`);

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

}
