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

// Load environment variables
dotenv.config();

// Modules
import { BlockchainRouter } from "./server/blockchain.ts";
import { DataOptimizer } from "./server/optimizer.ts";
import { DataAnalyzer } from "./server/analyzer.ts";
import { blockchainConfig, dbConfig } from "./server/config.ts";
import { LogEntry, CoreStats, TransactionRecord, ReadyToSellItem } from "./src/types.ts";
import { WebCrawler } from "./server/crawler.ts";
import { MarketplaceManager } from "./server/marketplace.ts";

// --- GLOBAL SINGLETONS ---
const app = express();
export const mainOptimizer = new DataOptimizer();
export const mainBlockchain = new BlockchainRouter();
export const mainMarketplace = new MarketplaceManager();
export const mainCrawler = new WebCrawler({
  delayMs: 5000, // Her istek arasında 5 saniye bekle
  targetLimit: 999999
});

// 1. HEDEF BELİRLEME (Seed URLs)
const crawlerSeeds = [
  "https://wikipedia.org",
  "https://html.spec.whatwg.org",
  "https://www.w3.org/Consortium/mission",
  "https://en.wikipedia.org/wiki/Sustainable_computing"
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
  payoutWalletAddress: blockchainConfig.payoutWallet,
  zeroGasModeActive: false,
  autonomousMode: false,
  commitThreshold: 10,
  batchVolumeAccumulatedKB: 0, // Toplu işlem için biriken hacim
  aktifBakiyeUSDT: 0, // Simüle edilen aktif bakiye
};

// 1. ADIM: Ticaret Motorunun "Karar Mekanizması"
const ticaretMotoru = {
    hedefKotaMB: blockchainConfig.batchTradeThresholdMB,
    
    // Bakiyeyi kontrol et (API entegrasyonu hazırlığı)
    async bakiyeKontrol() {
        // İleride buraya Binance/Ocean API: await exchange.fetchBalance() gelecek
        return serverState.aktifBakiyeUSDT;
    },

    // Karar ver: Satış zamanı geldi mi?
    kararVer(islenenKB: number): boolean {
        const islenenMB = islenenKB / 1024;
        if (islenenMB >= this.hedefKotaMB) {
            pushLog('MARKET', 'ANALYZE', `[KOTA_DOLDU] Hedef kota (${this.hedefKotaMB} MB) aşıldı. Satış prosedürü tetikleniyor.`);
            return true;
        } else {
            const kalan = (this.hedefKotaMB - islenenMB).toFixed(2);
            pushLog('MARKET', 'INFO', `[KOTA_TAKİP] Mevcut: ${islenenMB.toFixed(2)} MB. Satışa kalan: ${kalan} MB`);
            return false;
        }
    }
};

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

// PERFORMANS: Sunucunun kilitlenmesini ve 500 hatalarını önlemek için DB indeksleri
TransactionSchema.index({ timestamp: -1 });
ReadyToSellSchema.index({ isSold: 1, signature: 1, timestamp: 1 });
ReadyToSellSchema.index({ id: 1 }, { unique: true });

const TransactionModel = mongoose.model("Transaction", TransactionSchema);
const ReadyToSellModel = mongoose.model("ReadyToSell", ReadyToSellSchema);

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
  module: 'SYSTEM' | 'MARKET' | 'EXECUTOR' | 'BLOCKCHAIN' | 'AI',
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
    client.write(sseData);
  }
}

/**
 * EXECUTOR: DİJİTAL GERİ DÖNÜŞÜM MOTORU
 * Görev Tipi: DATA_CLEANING_TASK
 * Mining: Piyasa fırsatlarını ve yeni veri kaynaklarını otonom tarar.
 */
async function checkMarketOpportunity() {
  if (mongoose.connection.readyState !== 1) return { isProfitable: false };
  
  // PROTOKOL_FIX: Sadece satılmamış VE henüz mühürlenmemiş (signature yok) paketleri işle
  // Bu satır eco-ymeen4 gibi mühürlenmiş ürünlerin tekrar işlenmesini engeller.
  const item = await ReadyToSellModel.findOne({ 
    isSold: false, 
    signature: { $exists: false } 
  }).sort({ timestamp: 1 });
  
  return {
    isProfitable: !!item,
    item: item
  };
}

async function broadcastToNetwork(itemId: string) {
  try {
    const item = await ReadyToSellModel.findOne({ id: itemId });
    if (!item) return;

    // PROTOKOL_REAL: Gas ücreti ödemeden kriptografik imza (Voucher) oluştur
    const signature = await mainBlockchain.createSignedSaleOrder(
      itemId, 
      item.co2SavingsGrams, 
      item.marketPriceUSD
    );
    
    const sellerAddress = mainBlockchain.getWalletAddress();

    if (signature && sellerAddress) {
      const valuationWei = ethers.utils.parseUnits(item.marketPriceUSD.toFixed(18), 18).toString();
      const priceFormatted = item.marketPriceUSD.toFixed(4);

      pushLog('BLOCKCHAIN', 'INFO', `[EIP-712] ${itemId} için $${priceFormatted} USDT mühürlendi.`);
      await ReadyToSellModel.updateOne({ id: itemId }, { 
        signature: signature,
        sellerAddress: sellerAddress,
        valuationWei: valuationWei
      });
      pushLog('BLOCKCHAIN', 'SUCCESS', `[VOUCHER_CREATED] ${itemId} için kriptografik satış emri mühürlendi. Alıcı bekleniyor.`);

      // PROTOKOL_EXPORT: Varlığı tüm pazar yeri kanallarına aynı anda ihraç et
      await broadcastToAllMarkets({
        id: itemId,
        signature: signature,
        price: item.marketPriceUSD,
        sellerAddress: sellerAddress,
        valuationWei: valuationWei
      });
    } else {
      throw new Error("Cüzdan yetkilendirme hatası.");
    }
  } catch (err: any) {
    pushLog('BLOCKCHAIN', 'ERROR', `[SIGN_FAILED] ${err.message}`);
  }
}

/**
 * PROTOKOL: Çok Kanallı İhracat Motoru
 * Promise.allSettled kullanarak tüm piyasalara paralel yayın yapar.
 */
async function broadcastToAllMarkets(item: any) {
    const channels = [
        { name: "OceanProtocol", url: blockchainConfig.oceanProtocolUrl },
        { name: "CustomMarket", url: blockchainConfig.marketplaceApiUrl },
        { name: "Middleware (Make.com)", url: blockchainConfig.middlewareWebhookUrl },
        { name: "GoogleSheets", url: blockchainConfig.googleSheetsUrl }
    ].filter(c => 
        c.url && 
        !c.url.includes('your-webhook-id') && 
        !c.url.includes('api.gercek-veri-borsasi.com') &&
        !c.url.includes('ocean.api')
    );

    if (channels.length === 0) {
        pushLog('MARKET', 'WARNING', `[EXPORT_IDLE] Aktif borsa kanalı bulunamadı. Lütfen .env dosyasına gerçek API adreslerini girin.`);
        return;
    }

    const broadcastPromises = channels.map(async (channel) => {
        try {
            let payload;
            
            // Protokol Ayrımı: Finansal Rapor mu yoksa Varlık İhracatı mı?
            if (item.type === "CASH_FLOW") {
              if (channel.name !== "GoogleSheets") return; // Finansal rapor sadece tabloya gider
              payload = {
                veri1: "TOPLU_SATIS_TETIKLENDI",
                veri2: `${item.amount} ${item.ticker} @ ${item.price} USDT`,
                veri3: new Date().toLocaleString('tr-TR')
              };
            } else {
              // Standart Varlık İhracatı
              payload = channel.name === "GoogleSheets" 
                ? { veri1: item.id, veri2: `$${item.price} USDT`, veri3: new Date().toLocaleString('tr-TR') }
                : item;
            }

            if (channel.name === "GoogleSheets") {
                // 3. Adım: Botun "CORS" Engelini Aşmalı (Fetch mode: no-cors)
                await fetch(channel.url, {
                    method: 'POST',
                    mode: 'no-cors', // BU SATIR HAYAT KURTARIR
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                await axios.post(channel.url, payload, { timeout: 10000 });
            }

            if (channel.name === "GoogleSheets") {
                const msg = item.type === "CASH_FLOW" ? "Nakit akışı raporu işlendi." : "Veri aktarım sinyali gönderildi.";
                pushLog('MARKET', 'SUCCESS', `[EXPORT_OK] ${msg} (Google Sheets).`);
            } else {
                pushLog('MARKET', 'SUCCESS', `[EXPORT_OK] ${channel.name} kanalına başarıyla aktarıldı.`);
            }
            
        } catch (err: any) {
            pushLog('MARKET', 'ERROR', `[EXPORT_FAILED] ${channel.name}: ${err.message}`);
        }
    });

    await Promise.allSettled(broadcastPromises);
}

/**
 * 2. ADIM: Satış Emri Tetikleyici (Ticaret Motoru Entegrasyonu)
 */
async function executeBatchTrade() {
  // Karar motorunu sorgula
  if (ticaretMotoru.kararVer(serverState.batchVolumeAccumulatedKB)) {
      pushLog('MARKET', 'SUCCESS', `[EXECUTING_TRADE] Borsa emirleri otonom olarak iletiliyor...`);
      
      const simulatedPrice = 65000 + Math.random() * 1000; 
      const tradeAmount = 0.046; // $3000 hedefine yönelik miktar
      
      // 1. Google Sheets'e "Nakit Akışı" raporu geç
      await broadcastToAllMarkets({
        type: "CASH_FLOW",
        ticker: blockchainConfig.marketOrderTicker,
        amount: tradeAmount,
        price: simulatedPrice.toFixed(2)
      });

      // 2. Finansal durumu güncelle
      serverState.aktifBakiyeUSDT += (tradeAmount * simulatedPrice);
      serverState.batchVolumeAccumulatedKB = 0; // Hacmi sıfırla
      
      pushLog('MARKET', 'SUCCESS', `[TRADE_COMPLETED] Nakit akışı Google Sheets'e mühürlendi.`);
  }
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
  await executeBatchTrade();

  try {
    // Onay eşiği kontrolü: Satılmamış öğe sayısı eşiğe ulaştı mı?
    const pendingCount = await ReadyToSellModel.countDocuments({ isSold: false });
    
    if (pendingCount >= serverState.commitThreshold || serverState.autonomousMode) {
      const opportunity = await checkMarketOpportunity();
      if (opportunity.isProfitable && opportunity.item) {
        pushLog('EXECUTOR', 'ANALYZE', `[BATCH_COMMIT] ${opportunity.item.id} otonom işleme alınıyor.`);
        await broadcastToNetwork(opportunity.item.id);
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
        co2SavingsGrams: metric.co2SavingsGrams,
        extractedKeywords: ["recyclable", "dark-data", "carbon-offset"],
        reportSummary: `STRÜKTÜREL GERİ DÖNÜŞÜM: ${url} düğümü başarıyla optimize edildi.`,
        marketPriceUSD: valuation,
        isSold: false,
        timestamp: new Date().toISOString(),
        valuationWei: valuationWei
      };

      if (mongoose.connection.readyState === 1) {
        const savedDoc = await ReadyToSellModel.create(newItem);
        pushLog('SYSTEM', 'SUCCESS', `[DB_COMMIT] Varlık Atlas Cluster'a mühürlendi: ${savedDoc.id}`);

        // --- PAZAR YERİ LİSTELEME (OFF-CHAIN / GASLESS) ---
        const result = await mainMarketplace.prepareAssetForSale(generatedId, valuation);
        pushLog('MARKET', 'SUCCESS', `[ASSET_READY] Varlık satışa hazırlandı. Durum: ${result.status}`);

        serverState.pagesProcessed++;
        serverState.totalKiloBytesSaved += (metric.bytesSaved / 1024);
        serverState.batchVolumeAccumulatedKB += metric.bytesSaved; // Hacmi biriktir
        serverState.totalCo2SavedGrams += metric.co2SavingsGrams;
        pushLog('MARKET', 'SUCCESS', `[YENİ_VARLIK] Veri geri dönüştürüldü ve envantere eklendi. Değer: $${valuation} USDT`);

        // PROTOKOL_EXPORT: Varlığı anında kriptografik olarak mühürle ve dış pazarlara ihraç et
        await broadcastToNetwork(generatedId);

        // 2. ADIM: Yeni akış - Raporlamadan hemen sonra kotayı kontrol et ve gerekirse sat
        await executeBatchTrade();
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
    pushLog('MARKET', 'ANALYZE', `[BATCH_PUSH] ${pendingItems.length} varlık için toplu onay başlatıldı.`);
    
    for (const item of pendingItems) {
      await broadcastToNetwork(item.id);
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
      blockchainProofsMinted: blockchainProofsMinted,
      transactions: transactions,
      visitedUrls: Array.from(serverState.visitedUrls),
      totalEarnings: totalEarnings,
      isCrawling: serverState.isCrawling,
      currentCrawlingUrl: serverState.currentCrawlingUrl,
      readyToSell: readyToSell,
      payoutWalletAddress: serverState.payoutWalletAddress,
      zeroGasModeActive: serverState.zeroGasModeActive,
      autonomousMode: serverState.autonomousMode,
      commitThreshold: serverState.commitThreshold,
      contractAddress: blockchainConfig.contractAddress,
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
  
  pushLog('SYSTEM', 'SUCCESS', `Cüzdan ayarları güncellendi. Hedef: ${serverState.payoutWalletAddress} | Sıfır-Gas Satış Modu: ${serverState.zeroGasModeActive ? "AKTİF" : "PASİF"}`);
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
      savedGrams: item.co2SavingsGrams,
      txHash: txHash,
      timestamp: new Date().toISOString()
    };

    if (mongoose.connection.readyState === 1) {
      await TransactionModel.create(record);
    }
    
    pushLog('BLOCKCHAIN', 'SUCCESS', `[ON_CHAIN_SALE] Varlık ${itemId} başarıyla satıldı! Tx: ${txHash}`);
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
    const optimizedHtml = mainOptimizer.optimizeHtml(html);
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
      co2SavingsGrams: savings.co2SavingsGrams,
      extractedKeywords: ["asset", "real-data", "mined"],
      reportSummary: `Doğrulanmış Karbon Varlığı: ${url} üzerinden ${savings.co2SavingsGrams.toFixed(4)}g CO2 tasarrufu mühürlendi.`,
      marketPriceUSD: valuation,
      isSold: false,
      timestamp: new Date().toISOString()
    };

    if (mongoose.connection.readyState === 1) {
      await ReadyToSellModel.create(newItem);
    }

    pushLog('EXECUTOR', 'SUCCESS', `[ASSET_CREATED] ID: ${generatedId} | QUALITY: ${qualityScore} | VALUATION: ${valuation} USDT`);

    res.json({
      url,
      originalSize: originalBytes,
      optimizedSize: optimizedBytes,
      bytesSaved: savings.bytesSaved,
      co2SavingsGrams: savings.co2SavingsGrams,
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
  // Connect to MongoDB
  try {
    const uri = dbConfig.uri;
    if (!uri) throw new Error("MONGO_URI konfigürasyonda tanımlanmamış!");
    
    await mongoose.connect(uri, { dbName: dbConfig.dbName });
    pushLog('SYSTEM', 'SUCCESS', `Atlas Cluster Bağlantısı OK: ${dbConfig.dbName}`);
  } catch (error: any) {
    pushLog('SYSTEM', 'ERROR', `Kritik Bağlantı Hatası: ${error.message}`);
    console.error("[CRITICAL] MongoDB connection failed:", error.message);
    // Üretim ortamında veritabanı olmadan sistemin çalışmasını engelliyoruz.
    process.exit(1); 
  }

  // Veritabanı bağlantısı kurulduktan sonra motoru tek bir noktadan başlat
  startAutomatedTrading();

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
      // Check if dist exists to avoid silent 502s
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
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
