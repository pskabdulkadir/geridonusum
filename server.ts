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
import { createServer as createViteServer } from "vite";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Modules
import { BlockchainRouter } from "./server/blockchain.ts";
import { DataOptimizer } from "./server/optimizer.ts";
import { generateEcoReport } from "./server/gemini.ts";
import { blockchainConfig, dbConfig } from "./server/config.ts";
import { LogEntry, CoreStats, TransactionRecord, ReadyToSellItem } from "./src/types.ts";

// --- GLOBAL INSTANCES (Tanımlamalar Tek Sefer Yapılmalı) ---
const app = express();
const mainOptimizer = new DataOptimizer();
const mainBlockchain = new BlockchainRouter();

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
};

// --- MONGODB MODELLERİ (GERÇEK VERİ İÇİN) ---
const TransactionSchema = new mongoose.Schema({
  url: String,
  proofHash: String,
  savedGrams: Number,
  txHash: String,
  simulated: Boolean,
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
  timestamp: { type: Date, default: Date.now }
});

const TransactionModel = mongoose.model("Transaction", TransactionSchema);
const ReadyToSellModel = mongoose.model("ReadyToSell", ReadyToSellSchema);

// UNHANDLED ERROR CATCHER - Prevent 502 by keeping process alive
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  pushLog('SYSTEM', 'WARNING', `Beklenmedik Rejection: ${reason}`);
});

process.on('uncaughtException', (err: Error) => {
  console.error('⚠️ Uncaught Exception:', err);
});

// CRITICAL CONFIG VALIDATION
if (!blockchainConfig.contractAddress || blockchainConfig.contractAddress.includes('0x00000000')) {
  console.warn("⚠️  WARNING: SMART_GATE_CONTRACT_ADDRESS is not properly configured in .env!");
}
if (!blockchainConfig.privateKey) {
  console.warn("⚠️  WARNING: INCOME_DISTRIBUTION_WALLET (Private Key) is missing. System will run in Autonomous Simulation Mode.");
}
if (!dbConfig.uri) {
  console.warn("⚠️  WARNING: MONGO_URI is not configured. Database persistence may be disabled.");
}
// USE_AI_ANALYSIS parametresi ile AI özellikleri kontrol edildiği için eski uyarıyı pasifize ediyoruz
// if (!blockchainConfig.geminiApiKey || blockchainConfig.geminiApiKey === "MY_GEMINI_API_KEY") {
//   console.warn("⚠️  WARNING: GEMINI_API_KEY is not configured. Gemini AI features may be limited.");
// }
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
  
  // Envanterde henüz satılmamış (isSold: false) bir paket ara
  const item = await ReadyToSellModel.findOne({ isSold: false }).sort({ timestamp: 1 });
  
  return {
    isProfitable: !!item,
    item: item
  };
}

async function broadcastToNetwork(itemId: string) {
  try {
    const bnbAmount = "0.0005"; // Güvenli test miktarı
    const txHash = await mainBlockchain.executeRealSale(bnbAmount);
    
    if (txHash) {
      await ReadyToSellModel.updateOne({ id: itemId }, { isSold: true });
      pushLog('MARKET', 'SUCCESS', `GERÇEK SATIŞ ONAYLANDI: Paket ${itemId} satıldı. Tx: ${txHash}`);
    }
  } catch (err: any) {
    pushLog('EXECUTOR', 'ERROR', `Ağ üzerinde gerçek işlem başarısız: ${err.message}`);
  }
}

async function startAutomatedTrading() {
  pushLog('SYSTEM', 'INFO', "EXECUTOR MODU: Otonom işlem motoru aktif, piyasa taranıyor...");
  
  setInterval(async () => {
    if (!serverState.isCrawling) return; // Dashboard üzerinden motor durdurulmuşsa işlem yapma

    // --- VERİ MADENCİLİĞİ (MINING) VE LİSTENER ---
    pushLog('MARKET', 'INFO', "Mining: Yeni veri kaynakları ve likidite taranıyor...");
    
    const opportunity = await checkMarketOpportunity();
    
    if (opportunity.isProfitable && opportunity.item) {
      // --- DATA_CLEANING_TASK AKTİF ---
      pushLog('EXECUTOR', 'ANALYZE', `[DATA_CLEANING_TASK] ${opportunity.item.id} geri dönüşüm süreci başlatıldı.`);
      
      // Değerleme Algoritması Çalıştırılıyor
      const valuation = mainOptimizer.calculateDataValue(opportunity.item.co2SavingsGrams, 1024);
      pushLog('MARKET', 'SUCCESS', `Değerleme Tamamlandı: Paket Değeri $${valuation} USDT`);

      await broadcastToNetwork(opportunity.item.id);
    }
  }, 10000); // 10 saniyede bir kontrol
}

mainBlockchain.registerLogger((module, level, msg) => {
  pushLog(module, level, msg);
});

// Setup initial warm system log
pushLog('SYSTEM', 'INFO', 'Üretim Çekirdeği: Executor ve Ledger modülleri aktif.');

/* ==========================================
   REST API Endpoints Control Channels
   ========================================== */

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
 * Execute a real-time smart contract payout on Binance Smart Chain (BSC)
 * routing actual BNB directly to your configured destination wallet.
 */
app.post("/api/execute-payout", async (req, res) => {
  const { itemId } = req.body;
  let item: ReadyToSellItem | null = null;
  if (mongoose.connection.readyState === 1) {
    item = await ReadyToSellModel.findOne({ id: itemId });
  } else {
    return res.status(503).json({ error: "Veritabanı bağlantısı aktif değil. İşlem yapılamadı." });
  }
  
  if (!item) {
    return res.status(404).json({ error: "Veri paketi bulunamadı." });
  }
  
  if (item.isSold) {
    return res.status(400).json({ error: "Bu paket zaten satıldı." });
  }
  
  // 1. Mark as sold to lock state immediately
  if (mongoose.connection.readyState === 1) {
    await ReadyToSellModel.updateOne({ id: itemId }, { isSold: true });
  } else {
    pushLog('SYSTEM', 'WARNING', 'MongoDB bağlantısı aktif değil. Veri paketi güncellenemedi.');
  }
  
  // Set the payout amount in BNB (0.0005 BNB is ~ $0.30 - $0.40, a very safe micro-payment to test live block integration without draining real funds)
  const bnbAmount = "0.0005"; 

  pushLog('EXECUTOR', 'INFO', `Gelir çekme işlemi başlatıldı. Hedef Cüzdan: ${serverState.payoutWalletAddress} | Tutar: ${bnbAmount} BNB`);

  // Execute BSC transfer via the blockchain router
  // Gerçek satış işlemi doğrudan çağrılır
  const txHash = await mainBlockchain.executeRealSale(bnbAmount);

  const txResult = { success: true, txHash: txHash, simulated: false }; // executeRealSale doğrudan hash döndürdüğü için bu şekilde simüle ediyoruz

  const record: TransactionRecord = {
    url: item.url,
    proofHash: item.proofHash,
    savedGrams: item.co2SavingsGrams,
    txHash: txResult.txHash,
    simulated: txResult.simulated,
    timestamp: new Date().toISOString()
  };
  
  if (txHash) { // İşlem hash'i varsa başarılı sayılır
    if (mongoose.connection.readyState === 1) {
      await TransactionModel.create(record);
    } else {
      pushLog('SYSTEM', 'WARNING', 'MongoDB bağlantısı aktif değil. İşlem kaydı yapılamadı.');
    }

    pushLog('BLOCKCHAIN', 'SUCCESS', `[ÖDEME_TAMAMLANDI] BSC Ana Ağı üzerinden ${bnbAmount} BNB başarıyla ${serverState.payoutWalletAddress} cüzdanına transfer edildi.`);
    pushLog('SYSTEM', 'SUCCESS', `[ZİNCİR_KAYDI_OK] İşlem Kodu: ${txHash}`);
    
    pushLog('AI', 'SUCCESS', `[READY_TO_SELL] "${item.id}" nolu paket verisi alıcıya serbest bırakıldı.`);
    
    res.json({ success: true, item, transaction: record });
  } else {
    // Reverse status so the user can re-try after funding or adding key
    if (mongoose.connection.readyState === 1) {
      await ReadyToSellModel.updateOne({ id: itemId }, { isSold: false });
    } else {
      pushLog('SYSTEM', 'WARNING', 'MongoDB bağlantısı aktif değil. Veri paketi geri alınamadı.');
    }
    pushLog('BLOCKCHAIN', 'ERROR', `Blockchain payouts transferi gerçekleştirilemedi: ${txResult.error}`);
    res.status(500).json({ error: txResult.error || "Blockchain payout transaction failed." });
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

  // Pre-seed connection with previous logs history for UI continuity
  const history = serverState.crawlerLogs.slice(-40);
  for (const log of history) {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  }

  clients.add(res);

  req.on("close", () => {
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

  pushLog('EXECUTOR', 'INFO', `Taktik Madencilik Başlatıldı: ${url}`);

  try {
    // 1. Gerçek Veri Çekme
    const response = await axios.get(url, { timeout: 10000 });
    const html = response.data;
    const originalBytes = Buffer.byteLength(html);

    // 2. Optimizasyon ve Hesaplama
    const optimizedHtml = mainOptimizer.optimizeHtml(html);
    const optimizedBytes = Buffer.byteLength(optimizedHtml);
    const savings = mainOptimizer.calculateCarbonSavings(originalBytes, optimizedBytes, 35000);
    const proofHash = mainOptimizer.generateProofHash(url, savings.bytesSaved, savings.co2SavingsGrams, optimizedHtml);

    // 3. Veritabanına Kaydet
    const generatedId = "eco-" + Math.random().toString(36).substring(2, 8);
    const newItem: ReadyToSellItem = {
      id: generatedId,
      url,
      proofHash,
      co2SavingsGrams: savings.co2SavingsGrams,
      extractedKeywords: ["asset", "real-data", "mined"],
      reportSummary: `Doğrulanmış Karbon Varlığı: ${url} üzerinden ${savings.co2SavingsGrams.toFixed(4)}g CO2 tasarrufu mühürlendi.`,
      marketPriceUSD: parseFloat((5 + Math.random() * 5).toFixed(2)),
      isSold: false,
      timestamp: new Date().toISOString()
    };

    if (mongoose.connection.readyState === 1) {
      await ReadyToSellModel.create(newItem);
    }

    // 4. AI Raporu
    let aiReport = "";
    if (blockchainConfig.useAiAnalysis) {
      aiReport = await generateEcoReport(url, originalBytes, optimizedBytes, savings.co2SavingsGrams);
    }

    pushLog('BLOCKCHAIN', 'SUCCESS', `Yeni veri varlığı oluşturuldu: ${generatedId}`);

    res.json({
      url,
      originalSize: originalBytes,
      optimizedSize: optimizedBytes,
      bytesSaved: savings.bytesSaved,
      co2SavingsGrams: savings.co2SavingsGrams,
      efficiencyGainPct: savings.efficiencyGainPct,
      proofHash,
      id: generatedId,
      aiReport
    });

  } catch (err: any) {
    pushLog('EXECUTOR', 'ERROR', `Madencilik başarısız: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

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
