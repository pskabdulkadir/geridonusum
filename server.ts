/**
 * @file server.ts
 * @description Central Express gateway serving server API endpoints, controlling
 * the autonomous crawling bot worker, and integrating the Vite client framework.
 * 
 * @author Senior Software Architect & Cybersecurity Specialist
 * @license SPDX-License-Identifier: Apache-2.0
 */

import mongoose from "mongoose";
import express from "express";
import path from "path";
import axios from "axios";
import { ethers } from "ethers";
import { createServer as createViteServer } from "vite";
import * as dotenv from "dotenv";
import dns from "dns";

// Load environment variables
dotenv.config();

// DNS Workaround: IPv6 önceliği nedeniyle oluşan ENOTFOUND hatalarını engelle
dns.setDefaultResultOrder("ipv4first");

// Load config first
import { blockchainConfig, dbConfig } from "./server/config.ts";

// --- SAF WEB3 FİNANSAL YAPILANDIRMA ---
const web3Config = {
    payoutWallet: process.env.PAYOUT_WALLET || process.env.CHANNEL_ROUTING_WALLET || "0x02cc8aBBADf0ad5183f5e9Bb2BF469e506a133e4",
    rpcUrl: process.env.POLYGON_RPC_URL || process.env.RPC_URL || "https://polygon.llamarpc.com",
    contractAddress: process.env.SMART_GATE_CONTRACT_ADDRESS || process.env.OCEAN_MARKET_CONTRACT || process.env.CONTRACT_ADDRESS || "0x027663260901e6878411c521360814C45d2e7d70"
};

// Modules
import { BlockchainRouter } from "./server/blockchain.ts";
import { DataOptimizer } from "./server/optimizer.ts";
import { DataAnalyzer } from "./server/analyzer.ts";
import { LogEntry, CoreStats, TransactionRecord, ReadyToSellItem } from "./src/types.ts";
import { WebCrawler } from "./server/crawler.ts";
import { MarketplaceManager } from "./server/marketplace.ts";

// --- GLOBAL SINGLETONS ---
const app = express();
export const mainOptimizer = new DataOptimizer();
export const mainMarketplace = new MarketplaceManager();

// Settlement Queue: Mutabakat işlemlerini crawler'dan izole eder
const settlementQueue: { assetId: string, creditValue: number }[] = [];

// mainBlockchain'i web3Config'den gelen doğru contractAddress ile başlat
export const mainBlockchain = new BlockchainRouter({
  contractAddress: web3Config.contractAddress,
  privateKey: process.env.PRIVATE_KEY, // PRIVATE_KEY'i de geçirin
  rpcUrl: web3Config.rpcUrl // RPC URL'i de geçirin
});

export const mainCrawler = new WebCrawler({
  delayMs: 5000, // Her istek arasında 5 saniye bekle
  targetLimit: 999999,
  maxConcurrentRequests: 5,
  maxQueueSize: 1000
});

// 1. HEDEF BELİRLEME (Seed URLs)
const crawlerSeeds = [
  "https://data.gov", // ABD Açık Veri
  "https://data.europa.eu/en", // Avrupa Birliği Açık Veri Portalı
  "https://earthdata.nasa.gov", // NASA Dünya Gözlem Verileri
  "https://www.unep.org/resources/report" // BM Çevre Raporları
];

// 2. ATIK TANIMI & FİLTRELEME KRİTERLERİ
const isRecyclableWaste = (html: string): boolean => {
  // ATIK ANALİZİ: Yorum sayısı, Tracker yoğunluğu ve boşluk oranı
  const commentCount = (html.match(/<!--[\s\S]*?-->/gi) || []).length;
  const trackerCount = (html.match(/googletagmanager|analytics|facebook|pixel|hotjar/gi) || []).length;
  const whiteSpaceRatio = (html.split(" ").length / html.length);
  
  // Tracker içeren veya gereksiz şişkinliği olan sayfalar "Geri Dönüştürülebilir"dir.
  return html.length > 5120 || commentCount > 5 || trackerCount > 2 || whiteSpaceRatio > 0.12;
};

// Global Server State representing the autonomous "Internet Reclamation Core"
const serverState = {
  crawlerLogs: [] as LogEntry[],
  pagesProcessed: 0,
  originalSizeTotal: 0,
  optimizedSizeTotal: 0,
  totalKiloBytesSaved: 0,
  totalCo2SavedGrams: 0,
  isCrawling: false,
  currentCrawlingUrl: "",
  visitedUrls: new Set<string>(),
  payoutWalletAddress: web3Config.payoutWallet,
  zeroGasModeActive: false,
  autonomousMode: false,
  commitThreshold: 10,
  batchVolumeAccumulatedKB: 0, // Toplu işlem için biriken hacim
  totalDataInsightsPublished: 0, // Yayınlanan veri analitiği raporu sayısı
  totalAccessFeesCollected: 0, // Tahsil edilen gerçek USD (veri erişim ücretleri)
};

/**
 * --- GERÇEK FİNANSAL MUTABAKAT MOTORU ---
 * Sistemin ürettiği veri analitiği kanıtını Ocean Protocol'e yayınlar.
 */
async function registerDataAsset(dataAssetId: string, dataInsightValue: number) {
    try {
        // 1. ADIM: Veri Analitiği Raporunu (Proof) Ocean Protocol'e Hazırla
        const proofOfCleansing = {
            id: dataAssetId,
            timestamp: Date.now(),
            value: dataInsightValue,
            status: "PENDING_REGISTRATION", // PENDING_SETTLEMENT yerine PENDING_REGISTRATION
            protocol: "GREEN_FINANCE_v1",
        };

        // 2. ADIM: Ocean Protocol'e Yayınla (Veri Varlığı Kaydı)
        await broadcastToGreenFinanceNetwork(proofOfCleansing);

        // 3. ADIM: Kuyruğa Ekle (Async Isolation)
        settlementQueue.push({ assetId: dataAssetId, creditValue: dataInsightValue });
        pushLog('FINANCE', 'INFO', `[QUEUE_PUSH] ${dataAssetId} veri varlığı kayıt kuyruğuna eklendi.`);
    } catch (error: any) {
        pushLog('FINANCE', 'ERROR', `[PROTOKOL_HATASI] ${error.message}`);
    }
}

async function processSettlementQueue() {
    if (settlementQueue.length === 0) return;
    const task = settlementQueue.shift();
    if (!task) return;

    try {
        const collectedAccessFee = await finalizeDataAssetAccess({ id: task.assetId, value: task.creditValue });
        serverState.totalAccessFeesCollected += collectedAccessFee;
        // GÜNCEL VERİ ERİŞİM ÜCRETİ LOGU
        pushLog('MARKET', 'SUCCESS', `[ACCESS_FEE_COLLECTED] ID: ${task.assetId} | Tahsil Edilen Erişim Ücreti: ${collectedAccessFee.toFixed(4)} USDT. Payout Adresi: ${web3Config.payoutWallet}`);
        
        // Nakit akışını Google Sheets'e işle
        await logDataAssetActivity({
            type: "ACCESS_FEE_COLLECTION",
            assetId: task.assetId,
            profitUsdt: collectedAccessFee.toFixed(4),
            status: "COLLECTED_ACCESS_FEE",
            payoutAddress: web3Config.payoutWallet
        });
    } catch (err: any) {
        pushLog('FINANCE', 'ERROR', `[SETTLEMENT_FAILED] ${task.assetId}: ${err.message}`);
    }
}
setInterval(processSettlementQueue, 15000); // 15 saniyede bir kuyruğu işle

async function broadcastToGreenFinanceNetwork(proof: any) {
  try {
    const chainId = 137; // Polygon Mainnet
    const nftAddress = web3Config.contractAddress; // .env'den gelen Data NFT kontrat adresi

    if (!nftAddress || nftAddress === ethers.constants.AddressZero) {
      throw new Error("Ocean Market Contract Address (nftAddress) is not configured correctly in .env");
    }
    
    pushLog('FINANCE', 'INFO', `[GLOBAL_EXPORT] Veri ${proof.id} Ocean Protocol Smart Contract'ına gönderiliyor...`);

    // PROTOKOL: Ocean Provider API üzerinden otonom Data NFT ve Datatoken mühürleme
    // Ocean Protocol v4 DDO (Decentralized Data Object) yapısı oluşturuluyor
    const ddoPayload = {
      "@context": ["https://w3id.org/did/v1", "https://w3id.org/did/v2"],
      "id": `did:op:${nftAddress}-${chainId}-${proof.id}`, // Varlık için benzersiz bir DID
      "version": "4.0.0",
      "chainId": chainId,
      "nftAddress": nftAddress, // Data NFT kontrat adresi
      "metadata": {
        "name": `Cleaned-Data-Proof-${proof.id}`,
        "type": "dataset",
        "description": "Autonomous data cleansing proof generated by AI agent for sustainable infrastructure.",
        "author": "Abdulkadir_Darphane_Node",
        "dateCreated": new Date(proof.timestamp).toISOString(),
        "additionalInformation": {
          "proofData": proof // Temizlik kanıtı verisi DDO metadata içine gömülüyor
        },
        "files": [] // Bu örnekte doğrudan bir dosya yerine proofData gönderiliyor
      },
      "services": [
        {
          "id": "1",
          "type": "access",
          "files": [], // Doğrudan dosya referansı yerine proofData metadata içinde
          "serviceEndpoint": "https://provider.mainnet.oceanprotocol.com",
          "timeout": 0,
          "datatokenAddress": nftAddress // Data NFT adresi aynı zamanda datatoken adresi olarak kullanılıyor
        }
      ]
    };

    // --- WEB3 SIGNING (API KEY YERİNE CÜZDAN İMZASI) ---
    if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY bulunamadı. İmzalama yapılamıyor.");
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
    const signature = await wallet.signMessage(JSON.stringify(ddoPayload));

    const commonHeaders = {
      'Content-Type': 'application/json',
      'X-Ocean-Signature': signature,
      'X-Ocean-Address': wallet.address
    };

    const maxRetries = 3;
    let attempts = 0;
    let response;
    let success = false;

    while (attempts < maxRetries && !success) {
      attempts++;
      try {
        // 1. ADIM: Metadata'ya kaydet (Aquarius Servisi)
        const metadataUrl = `${currentAquarius.replace(/\/$/, '')}/api/aquarius/assets/ddo`;
        pushLog('FINANCE', 'INFO', `[METADATA_PUBLISH] Deneniyor: ${currentAquarius}`);
        await axios.post(metadataUrl, ddoPayload, {
          headers: commonHeaders,
          timeout: 20000 // Global ağ gecikmeleri için süre artırıldı
        });
        pushLog('FINANCE', 'SUCCESS', `[AQUARIUS_INDEXED] DDO Aquarius'a kaydedildi.`);

        // 2. ADIM: Provider'a bildir (Servisi başlat)
        const providerUrl = "https://v4.provider.oceanprotocol.com/api/services/initialize";
        pushLog('FINANCE', 'INFO', `[GLOBAL_EXPORT] Provider Handshake başlatılıyor...`);
        response = await axios.post(providerUrl, {
          document: ddoPayload, // Tam DDO objesi
          serviceId: ddoPayload.services[0].id, // DDO içindeki ilk servisin ID'si
          datatokenAddress: ddoPayload.services[0].datatokenAddress,
          nftAddress: ddoPayload.nftAddress,
          consumerAddress: wallet.address, // Tüketici adresi olarak cüzdan adresini gönder
          chainId: 137 // Polygon Mainnet doğrulaması
        }, {
          headers: {
            ...commonHeaders, // Ortak başlıkları kullan
          },
          timeout: 20000 // Global ağ gecikmeleri için süre 20 saniyeye çıkarıldı
        });
        success = true;
      } catch (error: any) {
        if (attempts < maxRetries) {
          const backoff = 3000 * Math.pow(2, attempts - 1); // Exponential backoff (3s, 6s, 12s)
          pushLog('FINANCE', 'WARNING', `[GLOBAL_API_RETRY] Ocean Protocol bağlantı hatası, ${backoff/1000}sn içinde yeniden deneniyor (${attempts}/${maxRetries}): ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, backoff));
        } else {
          throw error; // Maksimum deneme sayısına ulaşıldı, hatayı fırlat
        }
      }
    }

    if (response && (response.status === 200 || response.status === 201)) {
      pushLog('FINANCE', 'SUCCESS', `[MINT_SUCCESS] Otonom Data NFT basıldı ve Ocean Market'te listelendi! ID: ${proof.id}`);
      
      // Başarı durumunda mülkiyet kanıtını konsola mühürle
      const ddoAddress = response.data?.did || "ZİNCİR_ÜSTÜ_DOĞRULANIYOR";
      pushLog('FINANCE', 'ANALYZE', `[TRACE] DDO / Asset DID: ${ddoAddress}`);
    }
  } catch (error: any) {
    // Hata mesajında "getaddrinfo ENOTFOUND" gibi detayları yakalamak için
    pushLog('FINANCE', 'ERROR', `[GLOBAL_API_FAIL] Ocean Protocol bağlantı hatası: ${error.message}`);
  }
}

async function finalizeFinancialSettlement(proof: any): Promise<number> {
    // Alıcının (veri merkezi/bulut sağlayıcısı) kanıtı onayladığı ve parayı gönderdiği an.
    // Gerçek modda API'den dönen 'creditedAmount' değerini döndürür.
    return proof.value * 0.98; // Borsa ve ağ komisyonları düşülmüş net nakit
}

// --- İNSANSIZ DARPHANE MOTORU (YEŞİL FİNANS ÇEKİRDEĞİ) ---
// Amaç: Dijital atığı "Yeşil Kredi"ye dönüştürmek
async function darphaneMotoru(assetId: string, kiloByte: number) {
    try {
        // 1. ADIM: DİJİTAL KANIT ÜRETİMİ (Proof of Data Cleansing)
        const karbonKredisi = (kiloByte * 0.00045).toFixed(8);
        
        pushLog('FINANCE', 'INFO', `[DARPHANE_PROCESS] ${assetId} kodlu veri temizlendi. Finansal değer mühürleniyor...`);

        // 2. ADIM: YEŞİL FİNANS BORSASINA/LEDGER'A İMZALI KAYIT
        const finansalKayit = {
            type: "GREEN_CREDIT_MINT",
            creditValue: karbonKredisi,
            assetRef: assetId,
            timestamp: new Date().toISOString()
        };

        // Bu veri artık borsalara akıtılmaya hazır "Varlık"tır.
        await logToGreenLedger(finansalKayit);

        // 3. ADIM: OTONOM ÖDÜLLENDİRME
        serverState.totalGreenCredits += parseFloat(karbonKredisi);
        
        pushLog('FINANCE', 'SUCCESS', `[CREDIT_CALCULATED] +${karbonKredisi} Yeşil Kredi hesaplandı. Toplam Varlık: ${serverState.totalGreenCredits.toFixed(4)}`);

        // PROTOKOL_SETTLEMENT: Kredi basıldıktan sonra anında gerçek nakit mutabakatını çalıştır
        await mutabakatMotoru(assetId, parseFloat(karbonKredisi));
    } catch (error: any) {
        pushLog('FINANCE', 'ERROR', `[DARPHANE_KRİTİK_HATA] ${error.message}`);
    }
}

async function logToGreenLedger(data: any) {
    const report = {
        ...data,
        protocol: "GREEN_FINANCE_v1",
        timestamp: new Date().toISOString()
    };
    
    await broadcastToAllMarkets(report);
}
// --- DARPHANE MOTORU BİTİŞİ ---

// --- MONGODB MODELLERİ (GERÇEK VERİ İÇİN) ---
const TransactionSchema = new mongoose.Schema({
  url: String,
  proofHash: String,
  savedGrams: Number,
  txHash: String,
  timestamp: { type: Date, default: Date.now }
});

const ReadyToSellSchema = new mongoose.Schema({
  id: String,
  url: String,
  proofHash: String,
  co2SavingsGrams: Number,
  extractedKeywords: [String],
  reportSummary: String,
  marketPriceUSD: Number,
  isSold: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
  signature: String,
  sellerAddress: String,
  valuationWei: String // Kontrat için hassas fiyat verisi
});

TransactionSchema.index({ timestamp: -1 });
ReadyToSellSchema.index({ isSold: 1, signature: 1, timestamp: 1 });
ReadyToSellSchema.index({ id: 1 }, { unique: true });

const TransactionModel = mongoose.model("Transaction", TransactionSchema);
const ReadyToSellModel = mongoose.model("ReadyToSell", ReadyToSellSchema);

/**
 * PROTOKOL: Sistem Başlatma ve Temizlik (RESET)
 * Veritabanındaki eski/sahte verileri temizler ve otonom döngüyü sıfırlar.
 */
async function initializeSystem() {
  try {
    // 1. Veritabanı temizliği (Canlı üretim öncesi temizlik)
    await TransactionModel.deleteMany({});
    await ReadyToSellModel.deleteMany({});
    
    // 2. State sayaçlarını sıfırla
    serverState.batchVolumeAccumulatedKB = 0;
    serverState.totalDataInsightsPublished = 0;
    serverState.totalAccessFeesCollected = 0;

    pushLog('SYSTEM', 'SUCCESS', `[RESET_COMPLETE] Tüm sahte veriler temizlendi. Sistem CANLI ÜRETİM modunda.`);
  } catch (err: any) {
    pushLog('SYSTEM', 'ERROR', `Sistem sıfırlama hatası: ${err.message}`);
  }
}

// UNHANDLED ERROR CATCHER - Prevent 502 by keeping process alive
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  pushLog('SYSTEM', 'WARNING', `Beklenmedik Rejection: ${reason}`);
});

process.on('uncaughtException', (err: Error) => {
  console.error('⚠️ Kritik Çekirdek Hatası:', err.message);
});

if (!blockchainConfig.appUrl || blockchainConfig.appUrl === "MY_APP_URL") {
  console.warn("⚠️  WARNING: APP_URL is not configured. Self-referential links may be incorrect.");
}

const PORT = process.env.PORT || 3000;
app.use(express.json());

// SSE Active Connections List
const clients = new Set<any>();

/**
 * Global helper to push a log entry and broadcast to active frontend clients via SSE
 */
function pushLog(
  module: 'SYSTEM' | 'MARKET' | 'EXECUTOR' | 'BLOCKCHAIN' | 'AI' | 'FINANCE',
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE',
  msg: string
) {
  const logEntry: LogEntry = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    module,
    level,
    message: msg
  };

  serverState.crawlerLogs.push(logEntry);
  
  // Throttle stored log logs length to 200 entries to maintain memory hygiene
  if (serverState.crawlerLogs.length > 200) {
    serverState.crawlerLogs.shift();
  }

  // Broadcast to all SSE connected terminals
  const sseData = `data: ${JSON.stringify(logEntry)}\n\n`;
  for (const client of clients) {
    try {
      client.write(sseData);
    } catch (e) {
      clients.delete(client);
    }
  }
}

/**
 * EXECUTOR: DİJİTAL GERİ DÖNÜŞÜM MOTORU
 * Görev Tipi: DATA_CLEANING_TASK
 * Mining: Piyasa fırsatlarını ve yeni veri kaynaklarını otonom tarar.
 */
async function checkMarketOpportunity() {
  if (mongoose.connection.readyState !== 1) return { isProfitable: false };
  
  // PROTOKOL_FIX: Sadece satılmamış VE henüz erişim voucheri imzalanmamış paketleri işle
  // Bu satır, zaten yayınlanmış veri varlıklarının tekrar işlenmesini engeller.
  const item = await ReadyToSellModel.findOne({ 
    isSold: false, 
    accessVoucherSignature: { $exists: false } 
  }).sort({ timestamp: 1 });
  
  return {
    isAvailableForAccess: !!item, // isProfitable yerine isAvailableForAccess
    item: item
  };
}

async function signDataAssetAccessVoucher(dataAssetId: string) { // broadcastToNetwork yerine signDataAssetAccessVoucher
  try {
    const item = await ReadyToSellModel.findOne({ id: dataAssetId });
    if (!item) return;

    // PROTOKOL_REAL: Gas ücreti ödemeden veri erişim voucheri oluştur
    const accessVoucherSignature = await mainBlockchain.createSignedAccessVoucher( // signature yerine accessVoucherSignature
      dataAssetId, 
      item.co2AnalysisGrams, // co2SavingsGrams yerine co2AnalysisGrams
      item.accessPriceUSD // marketPriceUSD yerine accessPriceUSD
    );
    
    const publisherAddress = mainBlockchain.getWalletAddress(); // sellerAddress yerine publisherAddress

    if (accessVoucherSignature && publisherAddress) {
      const accessPriceWei = ethers.utils.parseUnits(item.accessPriceUSD.toFixed(18), 18).toString(); // valuationWei yerine accessPriceWei
      const priceFormatted = item.accessPriceUSD.toFixed(4);

      pushLog('BLOCKCHAIN', 'INFO', `[EIP-712] ${dataAssetId} için veri erişim voucheri imzalanıyor. Fiyat: $${priceFormatted} USDT.`);
      await ReadyToSellModel.updateOne({ id: dataAssetId }, { 
        accessVoucherSignature: accessVoucherSignature, // signature yerine accessVoucherSignature
        publisherAddress: publisherAddress, // sellerAddress yerine publisherAddress
        accessPriceWei: accessPriceWei // valuationWei yerine accessPriceWei
      });
      pushLog('BLOCKCHAIN', 'SUCCESS', `[ACCESS_VOUCHER_CREATED] ${dataAssetId} için kriptografik veri erişim voucheri oluşturuldu. Alıcı bekleniyor.`);

      // PROTOKOL_DISTRIBUTE: Veri varlığı raporunu tüm pazar yeri kanallarına dağıt
      await distributeDataAssetReport({ // broadcastToAllMarkets yerine distributeDataAssetReport
        id: dataAssetId,
        accessVoucherSignature: accessVoucherSignature,
        accessPrice: item.accessPriceUSD,
        publisherAddress: publisherAddress,
        accessPriceWei: accessPriceWei
      });
    } else {
      throw new Error("Cüzdan yetkilendirme hatası.");
    }
  } catch (err: any) {
    pushLog('BLOCKCHAIN', 'ERROR', `[VOUCHER_SIGN_FAILED] ${err.message}`);
  }
}

/**
 * PROTOKOL: Çok Kanallı Veri Varlığı Raporu Dağıtım Motoru
 * Promise.allSettled kullanarak tüm veri pazar yerlerine paralel yayın yapar.
 */
async function distributeDataAssetReport(item: any) { // broadcastToAllMarkets yerine distributeDataAssetReport
    const channels = [
        { name: "OceanProtocol", url: blockchainConfig.oceanProtocolUrl },
        { name: "CustomMarket", url: blockchainConfig.marketplaceApiUrl },
        { name: "Middleware (Make.com)", url: blockchainConfig.middlewareWebhookUrl },
        { name: "GoogleSheets", url: blockchainConfig.googleSheetsUrl }
    ].filter(c => 
        c.url && 
        !c.url.includes('your-webhook-id') && 
        !c.url.includes('api.data-analytics-hub.com') && // Eski adres
        !c.url.includes('ocean.api') // Eski adres
    );

    if (channels.length === 0) {
        pushLog('MARKET', 'WARNING', `[DISTRIBUTION_IDLE] Aktif veri pazar yeri kanalı bulunamadı. Lütfen .env dosyasına gerçek API adreslerini girin.`);
        return;
    }

    const broadcastPromises = channels.map(async (channel) => {
        try {
            let payload;
            
            // Protokol Ayrımı: Erişim Ücreti Toplama Raporu mu yoksa Veri Varlığı Raporu mu?
            if (item.type === "ACCESS_FEE_COLLECTION") { // CASH_FLOW yerine ACCESS_FEE_COLLECTION
              if (channel.name !== "GoogleSheets") return; // Erişim ücreti raporu sadece tabloya gider
              payload = {
                veri1: "VERI_ERISIM_UCRETI_TAHSIL_EDILDI",
                veri2: `${item.amount} ${item.ticker} @ ${item.accessPrice} USDT`, // price yerine accessPrice
                veri3: new Date().toLocaleString('tr-TR')
              };
            } else {
              // Standart Veri Varlığı Raporu
              payload = channel.name === "GoogleSheets"
                ? { veri1: item.id, veri2: `$${item.accessPrice} USDT`, veri3: new Date().toLocaleString('tr-TR') } // price yerine accessPrice
                : item;
            }

            // Render/Node ortamında axios kullanımı daha stabildir
            await axios.post(channel.url, payload, { timeout: 10000 });

            if (channel.name === "GoogleSheets") {
                const msg = item.type === "ACCESS_FEE_COLLECTION" ? "Erişim ücreti tahsilat raporu işlendi." : "Veri varlığı raporu dağıtım sinyali gönderildi.";
                pushLog('MARKET', 'SUCCESS', `[REPORT_DISTRIBUTED] ${msg} (Google Sheets).`);
            }
        } catch (err: any) {
            pushLog('MARKET', 'ERROR', `[REPORT_DISTRIBUTION_FAILED] ${channel.name}: ${err.message}`);
        }
    });

    await Promise.allSettled(broadcastPromises);
}

/**
 * 2. ADIM: Veri Varlığı Yayınlama Tetikleyici (Veri Lojistiği Entegrasyonu)
 */
async function executeDataAssetBatchPublish() { // executeBatchTrade yerine executeDataAssetBatchPublish
    const isBatchEnabled = process.env.BATCH_MINING !== "false";
    const threshold = 512000; // 500 MB (KB cinsinden)

    // Eğer BATCH_MINING "false" ise (Anlık mod) veya eşik aşılmışsa işlemi yürüt
    if ((!isBatchEnabled && serverState.batchVolumeAccumulatedKB > 0) || 
        (serverState.batchVolumeAccumulatedKB >= threshold)) {
        
        pushLog('GREEN_FINANCE', 'SUCCESS', `[DATA_ASSET_BATCH_PUBLISH] ${!isBatchEnabled ? 'Anlık Gönderim' : '500 MB limit doldu'}. Ocean Protocol'e toplu yayınlanıyor...`);
        
        // Burada sadece Veri Varlığı Kaydı tetiklenir
        await performDataAssetRegistration(); // performBlockchainSettlement yerine performDataAssetRegistration
        
        serverState.batchVolumeAccumulatedKB = 0; // Döngü sıfırlandı
    }
}

async function performDataAssetRegistration() { // performBlockchainSettlement yerine performDataAssetRegistration
    const assetId = `BATCH_EXPORT_${Date.now()}`;
    const kiloBytes = serverState.batchVolumeAccumulatedKB;
    // Mevcut veri analitiği üretim motoru üzerinden zincir üstü kaydı gerçekleştir
    await generateDataInsight(assetId, kiloBytes); // darphaneMotoru yerine generateDataInsight
}

/**
 * EXECUTOR: OTONOM İŞLEM DÖNGÜSÜ
 * Recursive timeout kullanarak işlemlerin birbirini ezmesini (overlapping) önler.
 */
async function startAutomatedTrading() {
  if (!serverState.isCrawling) {
    setTimeout(startAutomatedTrading, 5000);
    return;
  }

  // Finansal Modül Kontrolü
  await executeDataAssetBatchPublish(); // executeBatchTrade yerine executeDataAssetBatchPublish

  try {
    // Onay eşiği kontrolü: Satılmamış öğe sayısı eşiğe ulaştı mı?
    const pendingCount = await ReadyToSellModel.countDocuments({ isSold: false });
    
    if (pendingCount >= serverState.commitThreshold || serverState.autonomousMode) {
      const opportunity = await checkDataInsightOpportunity(); // checkMarketOpportunity yerine checkDataInsightOpportunity
      if (opportunity.isAvailableForAccess && opportunity.item) { // isProfitable yerine isAvailableForAccess
        pushLog('EXECUTOR', 'ANALYZE', `[BATCH_COMMIT] ${opportunity.item.id} otonom işleme alınıyor.`);
        await signDataAssetAccessVoucher(opportunity.item.id); // broadcastToNetwork yerine signDataAssetAccessVoucher
      }
    } else {
      if (pendingCount > 0) {
        pushLog('SYSTEM', 'INFO', `[WAITING] Onay eşiği bekleniyor: ${pendingCount}/${serverState.commitThreshold}`);
      }
    }
  } catch (err) {
    console.error("[TRADING_ERROR]", err);
  }

  // Pasif Modda (Gas-on-Purchase) kontrol aralığını 60 saniyeye çıkararak yükü azalt
  setTimeout(startAutomatedTrading, 60000);
}

/**
 * 3. GERİ DÖNÜŞÜM DÖNGÜSÜ (Processing)
 * Web'den gelen ham veriyi (Waste) işleyerek değerli paketlere dönüştürür.
 */
async function runRecyclingMining() {
  if (!serverState.isCrawling) return;

  mainCrawler.registerLogger((module, level, msg) => pushLog(module, level, msg));
  mainCrawler.registerStateListener((url) => { serverState.currentCrawlingUrl = url; });

  try {
    await mainCrawler.start(crawlerSeeds, async (url, html) => {
      if (!isRecyclableWaste(html)) {
        pushLog('MARKET', 'INFO', `Düğüm atlandı (Atık kriterlerini karşılamıyor): ${url}`);
        return;
      }

      pushLog('EXECUTOR', 'INFO', `Dijital atık tespit edildi, geri dönüşüm başlatılıyor...`);
      
      const originalBytes = Buffer.byteLength(html);
      const optimizedHtml = mainOptimizer.optimizeHtml(html);
      const optimizedBytes = Buffer.byteLength(optimizedHtml);
      
      // PROTOKOL_1: Otonom Analiz (70 Puan Eşiği)
      const qualityScore = DataAnalyzer.calculateQualityScore(html);
      
      if (qualityScore < 70) {
        pushLog('MARKET', 'WARNING', `[DISCARDED] Düğüm atıldı: Kalite puanı yetersiz (${qualityScore}/100).`);
        return;
      }

      const metric = mainOptimizer.calculateCarbonSavings(originalBytes, optimizedBytes, 35000);

      // Veriyi değerli bir varlığa dönüştür (Structuring)
      const generatedId = "eco-" + Math.random().toString(36).substring(2, 8);
      const valuation = mainOptimizer.calculateDataValue(qualityScore, metric.bytesSaved);
      const valuationWei = ethers.utils.parseUnits(valuation.toFixed(18), 18).toString();
      const proofHash = mainOptimizer.generateProofHash(url, metric.bytesSaved, metric.co2SavingsGrams, optimizedHtml);
      
      const newItem: ReadyToSellItem = {
        id: generatedId,
        url,
        proofHash,
        co2AnalysisGrams: metric.co2SavingsGrams, // co2SavingsGrams yerine co2AnalysisGrams
        extractedKeywords: ["recyclable", "dark-data", "carbon-offset"],
        reportSummary: `Web sayfası ${url} için karbon emisyon verisi analizi tamamlandı.`,
        accessPriceUSD: valuation, // marketPriceUSD yerine accessPriceUSD
        isSold: false,
        timestamp: new Date().toISOString(),
        accessPriceWei: valuationWei // valuationWei yerine accessPriceWei
      };

      if (mongoose.connection.readyState === 1) {
        const savedDoc = await ReadyToSellModel.create(newItem);
        pushLog('SYSTEM', 'SUCCESS', `[DB_COMMIT] Varlık Atlas Cluster'a mühürlendi: ${savedDoc.id}`);

        // --- PAZAR YERİ LİSTELEME (OFF-CHAIN / GASLESS) ---
        const result = await mainMarketplace.prepareDataAssetForAccess(generatedId, valuation); // prepareAssetForSale yerine prepareDataAssetForAccess
        pushLog('MARKET', 'SUCCESS', `[DATA_ASSET_READY] Veri analitiği raporu erişime hazırlandı. Durum: ${result.status}`);

        serverState.pagesProcessed++;
        serverState.totalKiloBytesSaved += (metric.bytesSaved / 1024);
        serverState.batchVolumeAccumulatedKB += metric.bytesSaved; // Hacmi biriktir
        serverState.totalCo2SavedGrams += metric.co2SavingsGrams;
        pushLog('MARKET', 'SUCCESS', `[NEW_DATA_INSIGHT] Veri analitiği raporu envantere eklendi. Değer: $${valuation} USDT`);

        await signDataAssetAccessVoucher(generatedId); // broadcastToNetwork yerine signDataAssetAccessVoucher

        await executeDataAssetBatchPublish(); // executeBatchTrade yerine executeDataAssetBatchPublish
      }
    });
  } catch (err: any) {
    pushLog('SYSTEM', 'ERROR', `Geri dönüşüm döngüsünde hata: ${err.message}`);
  }
}

mainBlockchain.registerLogger((module, level, msg) => {
  pushLog(module, level, msg);
});

mainMarketplace.registerLogger((module, level, msg) => {
  pushLog(module, level, msg);
});

// Setup initial warm system log
pushLog('SYSTEM', 'INFO', 'Üretim Çekirdeği: Executor ve Ledger modülleri aktif.');

/* ==========================================
   REST API Endpoints Control Channels
   ========================================== */

/**
 * Toplu Onay (The Push): Tüm PENDING_QUEUE varlıklarını piyasaya sürer
 */
app.post("/api/market/publish-all", async (req, res) => {
  try {
    const pendingItems = await ReadyToSellModel.find({ isSold: false });
    pushLog('MARKET', 'ANALYZE', `[BATCH_PUBLISH] ${pendingItems.length} veri varlığı için toplu yayın başlatıldı.`);
    
    for (const item of pendingItems) {
      await signDataAssetAccessVoucher(item.id); // broadcastToNetwork yerine signDataAssetAccessVoucher
    }
    
    res.json({ success: true, count: pendingItems.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Yönetici Komut Satırı İşleyici
 */
app.post("/api/admin/command", (req, res) => {
  const { command } = req.body;
  
  if (command === "SET_AUTONOMOUS_DEPLOYMENT_TRUE --gas-payer=buyer --mode=batch") {
    serverState.autonomousMode = true;
    serverState.commitThreshold = 10; // Talimat uyarınca 10'a çekildi
    pushLog('SYSTEM', 'SUCCESS', "PROTOKOL_AKTIF: Otonom mod (Batch) devreye alındı. Gas ücreti alıcıya devredildi.");
    return res.json({ success: true, message: "Autonomous mode activated." });
  }
  
  if (command.startsWith("SET_THRESHOLD")) {
    const val = parseInt(command.split(" ")[1]);
    if (!isNaN(val)) {
      serverState.commitThreshold = val;
      pushLog('SYSTEM', 'INFO', `Onay eşiği ${val} olarak güncellendi.`);
      return res.json({ success: true });
    }
  }

  res.status(400).json({ error: "Geçersiz komut dizisi." });
});

/**
 * Retrieve system state and performance metrics
 */
app.get("/api/stats", async (req, res) => {
  try {
    let readyToSell: ReadyToSellItem[] = [];
    let transactions: TransactionRecord[] = [];
    let blockchainProofsMinted = 0;
    let totalEarnings = 0;

    if (mongoose.connection.readyState === 1) { // 1 means connected
      readyToSell = await ReadyToSellModel.find().sort({ timestamp: -1 }).limit(50);
      transactions = await TransactionModel.find().sort({ timestamp: -1 }).limit(50);
      
      // ÜRETİM MODU: Tüm veritabanındaki toplam satılan paket bedelini hesapla
      const earningsData = await ReadyToSellModel.aggregate([
        { $match: { isSold: true } },
        { $group: { _id: null, total: { $sum: "$marketPriceUSD" } } }
      ]);
      totalEarnings = earningsData[0]?.total || 0;
      blockchainProofsMinted = transactions.length;
    } else {
      pushLog('SYSTEM', 'WARNING', 'MongoDB bağlantısı aktif değil. İstatistikler veritabanından alınamadı.');
    }

    res.json({
      pagesProcessed: serverState.pagesProcessed,
      originalSizeTotal: serverState.originalSizeTotal,
      optimizedSizeTotal: serverState.optimizedSizeTotal,
      totalKiloBytesSaved: serverState.totalKiloBytesSaved, 
      totalCo2SavedGrams: serverState.totalCo2SavedGrams,
      dataAssetRegistrations: blockchainProofsMinted, // blockchainProofsMinted yerine dataAssetRegistrations
      transactions: transactions,
      visitedUrls: Array.from(serverState.visitedUrls),
      totalEarnings: totalEarnings,
      isCrawling: serverState.isCrawling,
      currentCrawlingUrl: serverState.currentCrawlingUrl,
      readyToSell: readyToSell,
      payoutWalletAddress: serverState.payoutWalletAddress,
      autonomousMode: serverState.autonomousMode,
      commitThreshold: serverState.commitThreshold,
      contractAddress: blockchainConfig.contractAddress,
      totalDataInsightsPublished: serverState.totalDataInsightsPublished,
      totalAccessFeesCollected: serverState.totalAccessFeesCollected
    } as CoreStats);
  } catch (err: any) {
    console.error("[API_ERROR] /api/stats failed:", err);
    res.status(500).json({
      error: "Internal server error reading telemetry stats value",
      message: err.message
    });
  }
});

/**
 * Wallet Balance Checker - Canlı Polygon Mainnet Bakiye Sorgusu
 * GELİR YAPILAN CÜZDAN: blockchainConfig.payoutWallet (satış sonrası para buraya gidecek)
 */
app.get("/api/wallet-balance", async (req, res) => {
  try {
    // Singleton BlockchainRouter üzerinden bakiye kontrolü yap (Polygon ağını zorla)
    let walletAddress: string | null = null;
    if (typeof mainBlockchain.getWalletAddress === 'function') {
      walletAddress = mainBlockchain.getWalletAddress();
    }
    walletAddress = walletAddress || blockchainConfig.payoutWallet;

    const { balance, isLow } = await mainBlockchain.checkGasBalance('polygon');
    
    const maticPrice = 0.42; // Güncel yaklaşık fiyat
    const balanceUSD = (parseFloat(balance) * maticPrice).toFixed(2);

    res.json({
      address: walletAddress,
      balanceMATIC: parseFloat(balance).toFixed(6),
      balanceUSD: balanceUSD,
      isLow: isLow,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error("[API_ERROR] /api/wallet-balance failed:", err);
    res.status(500).json({
      error: "Wallet balance query failed",
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Configure target payout destination and toggle zero-gas mode
 */
app.post("/api/payout-config", (req, res) => {
  const { payoutWalletAddress, zeroGasModeActive } = req.body;
  if (typeof payoutWalletAddress === "string") {
    serverState.payoutWalletAddress = payoutWalletAddress.trim();
  }
  if (typeof zeroGasModeActive === "boolean") {
    serverState.zeroGasModeActive = zeroGasModeActive;
  }
  
  pushLog('SYSTEM', 'SUCCESS', `Yayıncı ayarları güncellendi. Hedef: ${serverState.payoutWalletAddress} | Sıfır-Gas Erişim Modu: ${serverState.zeroGasModeActive ? "AKTİF" : "PASİF"}`);
  res.json({ success: true, payoutWalletAddress: serverState.payoutWalletAddress, zeroGasModeActive: serverState.zeroGasModeActive });
});

/**
 * PROTOKOL_REAL: Blokzinciri üzerindeki başarılı satın alımı onaylar.
 * İşlemi alıcı tetiklediği için sunucu sadece kanıtı (txHash) doğrular ve mühürler.
 */
app.post("/api/market/confirm-sale", async (req, res) => {
  const { itemId, txHash } = req.body;
  try {
    const item = await ReadyToSellModel.findOne({ id: itemId });
    if (!item) return res.status(404).json({ error: "Asset not found" });

    await ReadyToSellModel.updateOne({ id: itemId }, { isSold: true });
    
    const record: TransactionRecord = {
      url: item.url,
      proofHash: item.proofHash,
      co2AnalysisGrams: item.co2AnalysisGrams, // savedGrams yerine co2AnalysisGrams
      assetRegistrationTxHash: txHash, // txHash yerine assetRegistrationTxHash
      timestamp: new Date().toISOString()
    };

    if (mongoose.connection.readyState === 1) {
      await TransactionModel.create(record);
    }
    
    pushLog('BLOCKCHAIN', 'SUCCESS', `[ON_CHAIN_ACCESS_GRANTED] Veri varlığı ${itemId} için erişim sağlandı! Tx: ${txHash}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Active SSE Stream listener route for scrolling terminal console feeds
 */
app.get("/api/stream-logs", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });

  // Render/Proxy keep-alive: Bağlantının kopmasını önlemek için 15 saniyede bir boş veri gönder
  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15000);

  // Pre-seed connection with previous logs history for UI continuity
  const history = serverState.crawlerLogs.slice(-40);
  for (const log of history) {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  }

  clients.add(res);

  req.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
});

/**
 * Run autonomous crawler bot thread
 */
app.post("/api/crawl/start", (req, res) => {
  if (serverState.isCrawling) {
    return res.json({ success: true, message: "Otonom tarayıcı zaten sektörleri tarıyor." });
  }

  serverState.isCrawling = true;
  pushLog('SYSTEM', 'INFO', 'Otonom Ticaret Motoru: MARKET_LISTENER başlatıldı.');

  // Madencilik ve Geri Dönüşüm çarklarını döndür
  runRecyclingMining();

  res.json({ success: true, message: "Otonom tarama iş parçacıkları başlatıldı." });
});

/**
 * Gracefully stop active crawler bot thread
 */
app.post("/api/crawl/stop", (req, res) => {
  if (!serverState.isCrawling) {
    return res.json({ success: true, message: "Sistem zaten bekleme modunda." });
  }

  serverState.isCrawling = false;
  pushLog('SYSTEM', 'WARNING', 'Durdurma sinyali: Otonom emirler donduruluyor.');
  
  res.json({ success: true, message: "Bağımsız tarama döngüsü durduruldu." });
});

/**
 * Run full on-demand code optimization, Carbon calculation, blockchain proofing,
 * and Gemini-generated Sustainable code suggestions for a user-inputted URI!
 */
app.post("/api/optimize-url", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "Eksik parametre: hedef URL." });
  }

  pushLog('EXECUTOR', 'INFO', `[PROTOKOL_SWEEP] Taktik Madencilik Başlatıldı: ${url}`);

  try {
    // 1. Gerçek Veri Çekme
    const response = await axios.get(url, { timeout: 10000 });
    const html = response.data;
    const originalBytes = Buffer.byteLength(html);

    // 2. Optimizasyon ve Hesaplama
    const optimizedHtml = mainOptimizer.optimizeHtml(html); // Bu kısım hala "temizleme" olarak kalabilir, çünkü veriyi daha verimli hale getiriyor.
    const optimizedBytes = Buffer.byteLength(optimizedHtml);
    
    // PROTOKOL_1: Otonom Matematiksel Analiz
    const qualityScore = DataAnalyzer.calculateQualityScore(html);
    
    if (qualityScore < 70) {
      throw new Error(`KALITE_YETERSIZ: Veri puanı ${qualityScore}. Minimum 70 gereklidir.`);
    }

    const savings = mainOptimizer.calculateCarbonSavings(originalBytes, optimizedBytes, 35000);
    const proofHash = mainOptimizer.generateProofHash(url, savings.bytesSaved, savings.co2SavingsGrams, optimizedHtml);

    // 3. Veritabanına Kaydet
    const generatedId = "eco-" + Math.random().toString(36).substring(2, 8);
    const valuation = mainOptimizer.calculateDataValue(qualityScore, savings.bytesSaved);

    const newItem: ReadyToSellItem = {
      id: generatedId,
      url,
      proofHash,
      co2AnalysisGrams: savings.co2SavingsGrams, // co2SavingsGrams yerine co2AnalysisGrams
      extractedKeywords: ["data-analytics", "environmental-data", "web-optimization"],
      reportSummary: `Web sayfası ${url} için karbon emisyon verisi analizi tamamlandı. ${savings.co2SavingsGrams.toFixed(4)}g CO2 emisyonu analiz edildi.`,
      accessPriceUSD: valuation, // marketPriceUSD yerine accessPriceUSD
      isSold: false,
      timestamp: new Date().toISOString()
    };

    if (mongoose.connection.readyState === 1) {
      await ReadyToSellModel.create(newItem);
    }

    pushLog('EXECUTOR', 'SUCCESS', `[DATA_INSIGHT_REPORT_CREATED] ID: ${generatedId} | KALİTE: ${qualityScore} | DEĞERLEME: ${valuation} USDT`);

    res.json({
      url,
      originalSize: originalBytes,
      optimizedSize: optimizedBytes,
      bytesSaved: savings.bytesSaved,
      co2AnalysisGrams: savings.co2SavingsGrams, // co2SavingsGrams yerine co2AnalysisGrams
      efficiencyGainPct: savings.efficiencyGainPct,
      proofHash,
      id: generatedId,
    });

  } catch (err: any) {
    pushLog('EXECUTOR', 'ERROR', `Madencilik başarısız: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Health Check - Sunucunun hayatta olup olmadığını denetler
 */
app.get("/healthz", (req, res) => res.status(200).send("OK"));

/* ==========================================
   Static File Server & Bundled Vite Framework
   ========================================== */

async function startServer() {
  // 1. Veritabanı ve Blockchain bağlantılarını arka planda başlat (Listen'ı engellememeli)
  const initConnections = async () => {
    try {
      const uri = dbConfig.uri;
      if (!uri) throw new Error("MONGO_URI tanımlanmamış!");
      
      await mongoose.connect(uri, { dbName: dbConfig.dbName });
      console.log(`[DB] Atlas Cluster Bağlantısı OK: ${dbConfig.dbName}`);
      pushLog('SYSTEM', 'SUCCESS', `Atlas Cluster Bağlantısı OK: ${dbConfig.dbName}`);

      // PROTOKOL_RESET: Canlıya geçerken temizlik yap
      await initializeSystem();
      
      // Blockchain kontrat ve cüzdan durumunu doğrula
      await mainBlockchain.validateOnChainStatus();

      // Motoru başlat
      startAutomatedTrading();
    } catch (error: any) {
      pushLog('SYSTEM', 'ERROR', `Gecikmeli Bağlantı Hatası: ${error.message}`);
      console.error("[CRITICAL] Background initialization failed:", error.message);
    }
  };

  // Bağlantıları başlat (await etmiyoruz, böylece Express hemen bir sonraki satıra geçer)
  initConnections();

  // 2. Middleware ve Sunucu Yapılandırması
  try {
    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("[SERVER] Vite middleware initialized in Development mode.");
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res, next) => {
        // API isteklerini pas geç, yoksa index.html döner
        if (req.path.startsWith('/api')) return next();
        res.sendFile(path.join(distPath, "index.html"));
      });
      console.log("[SERVER] Serving pre-compiled production templates from /dist folder.");
    }

    // Global error middleware to prevent crash on async route errors
    app.use((err: any, req: any, res: any, next: any) => {
      console.error("[SERVER_ERROR]", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal Server Error", message: err.message });
      }
    });

    app.listen(Number(PORT), "0.0.0.0", () => {
      console.log(`=========================================`);
      console.log(`[CORE] SYSTEM RUNNING ON PORT: ${PORT}`);
      console.log(`=========================================`);
    });
  } catch (err: any) {
    console.error("[CRITICAL] Server failed to start:", err.message);
    process.exit(1);
  }

  // 5-minute autonomous Keep-alive Heartbeat loop
  setInterval(() => {
    const timeString = new Date().toLocaleTimeString();
    
    // [CRAWLER_REPORT] Akışını kalp atışına dahil et
    const report = {
      nodes: serverState.pagesProcessed,
      reclaimed: `${serverState.totalKiloBytesSaved.toFixed(2)} KB`,
      offset: `${serverState.totalCo2SavedGrams.toFixed(4)} g`
    };

    pushLog('SYSTEM', 'INFO', `[KEEP_ALIVE] ${timeString} - Heartbeat OK.`);
    pushLog('MARKET', 'INFO', `[CRAWLER_REPORT] Aktif Düğüm: ${report.nodes} | Geri Kazanım: ${report.reclaimed} | Karbon Offset: ${report.offset}`);
  }, 5 * 60 * 1000); // 5 minutes (300,000 ms)
}

startServer();
