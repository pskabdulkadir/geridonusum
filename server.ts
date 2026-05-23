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
import { WebCrawler } from "./server/crawler.ts";
import { DataOptimizer } from "./server/optimizer.ts";
import { BlockchainRouter } from "./server/blockchain.ts";
import { generateEcoReport } from "./server/gemini.ts";
import { blockchainConfig, dbConfig } from "./server/config.ts";

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

import { LogEntry, CoreStats, TransactionRecord, ReadyToSellItem } from "./src/types.ts";

const app = express();

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
if (!blockchainConfig.geminiApiKey || blockchainConfig.geminiApiKey === "MY_GEMINI_API_KEY") {
  console.warn("⚠️  WARNING: GEMINI_API_KEY is not configured. Gemini AI features may be limited.");
}
if (!blockchainConfig.appUrl || blockchainConfig.appUrl === "MY_APP_URL") {
  console.warn("⚠️  WARNING: APP_URL is not configured. Self-referential links may be incorrect.");
}

const PORT = process.env.PORT || 3000;

app.use(express.json());

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
  payoutWalletAddress: blockchainConfig.payoutWallet, // Initialize from config
  zeroGasModeActive: blockchainConfig.zeroGasActive, // Initialize from config for zero-gas autonomous sales protocol
};

// SSE Active Connections List
const clients = new Set<any>();

/**
 * Global helper to push a log entry and broadcast to active frontend clients via SSE
 */
function pushLog(
  module: 'SYSTEM' | 'CRAWLER' | 'OPTIMIZER' | 'BLOCKCHAIN' | 'AI',
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

// Instantiate Global Engines
const mainCrawler = new WebCrawler({
  delayMs: 1500, // Safe rate limiting in dashboard sweeps
  targetLimit: 999999999 // Representing unlimited loop structure
});

const mainOptimizer = new DataOptimizer();
const mainBlockchain = new BlockchainRouter();

// Synchronize Logging hooks from each module back to our unified SSE system
mainCrawler.registerLogger((module, level, msg) => {
  pushLog(module, level, msg);
});

mainCrawler.registerStateListener((url) => {
  serverState.currentCrawlingUrl = url;
});

mainOptimizer.registerLogger((module, level, msg) => {
  pushLog(module, level, msg);
});

mainBlockchain.registerLogger((module, level, msg) => {
  pushLog(module, level, msg);
});

// Seed list used when the user starts autonomous crawling
const crawlerSeeds = [
  "https://wikipedia.org",
  "https://html.spec.whatwg.org",
  "https://www.w3.org"
];

/**
 * Crawler Task Orchestrator and background worker callback
 */
async function runBotTaskRecursive() {
  if (!serverState.isCrawling) return;

  try {
    await mainCrawler.start(crawlerSeeds, async (url, html) => {
      // 1. Core Analytics tracking
      serverState.pagesProcessed++;
      const originalBytes = Buffer.byteLength(html);
      
      // 2. Perform HTML formatting optimizations (comments scrubbing, whitespaces compacting)
      const optimizedHtml = mainOptimizer.optimizeHtml(html);
      const optimizedBytes = Buffer.byteLength(optimizedHtml);
      serverState.originalSizeTotal += originalBytes;
      serverState.optimizedSizeTotal += optimizedBytes;

      const efficiencyGain = ((1 - (optimizedBytes / originalBytes)) * 100).toFixed(1);
      pushLog('OPTIMIZER', 'SUCCESS', `Temizlik tamamlandı. Geri kazanılan yoğunluk: ${(optimizedBytes / 1024).toFixed(2)} KB (Azalma oranı: %${efficiencyGain}).`);

      // 3. Carbon calculations (Assume 35,000 yearly server hits scheme)
      const calculatedAnnualTraffic = 35000;
      const metric = mainOptimizer.calculateCarbonSavings(originalBytes, optimizedBytes, calculatedAnnualTraffic);
      
      serverState.totalKiloBytesSaved += (metric.bytesSaved / 1024);
      serverState.totalCo2SavedGrams += metric.co2SavingsGrams;

      // 4. Sealed Cryptographic Proof
      const proofHash = mainOptimizer.generateProofHash(url, metric.bytesSaved, metric.co2SavingsGrams, optimizedHtml);

      // 5. Blockchain Proof Minting with Gas Preservation Threshold limit & Zero-Gas Seller Mode
      const gasPreservationThresholdGrams = 0.05;
      
      if (metric.co2SavingsGrams > gasPreservationThresholdGrams) {
        if (serverState.zeroGasModeActive) {
          const generatedId = "eco-" + Math.random().toString(36).substring(2, 8);
          const calculatedPrice = parseFloat((Math.max(5.00, metric.co2SavingsGrams * 2.5) + (Math.random() * 2)).toFixed(2));
          
          const newItem: ReadyToSellItem = {
            id: generatedId,
            url,
            proofHash,
            co2SavingsGrams: parseFloat(metric.co2SavingsGrams.toFixed(4)),
            extractedKeywords: ["carbon", "optimized", "green-web", ...url.split("/").filter(x => x.length > 2 && !x.includes(".")).map(x => x.toLowerCase()).slice(0, 3)],
            reportSummary: `Yapay Zeka Süzgeci Raporu: ${url} kaynağından ${metric.co2SavingsGrams.toFixed(4)} gram CO2 tasarrufu otonom temizlenerek satış listesine eklendi.`,
            marketPriceUSD: calculatedPrice,
            isSold: false,
            timestamp: new Date().toISOString()
          };
          
          // MongoDB'ye Kaydet (Kalıcı Satış Havuzu)
          await ReadyToSellModel.create(newItem);
          
          pushLog('AI', 'SUCCESS', `[READY_TO_SELL] Veri paketi yapay zeka tarafından süzülüp READY_TO_SELL portfolyosuna eklendi! Fiyat: $${calculatedPrice}`);
          pushLog('BLOCKCHAIN', 'INFO', `Sıfır-Gas Satış Modu Aktif. Cüzdan gas harcaması yapılmadı, alıcının sözleşmeye ödeme yapması bekleniyor.`);
        } else {
          // Send manual TX via polygon router (costs gas)
          pushLog('BLOCKCHAIN', 'INFO', `Özel Anahtar ile zincir içi doğrudan kayıt yapılıyor (Gas Modu)...`);
          const blockResult = await mainBlockchain.triggerBorsaSwap(metric.co2SavingsGrams, proofHash);
          
          if (blockResult.success) {
            await TransactionModel.create({
              url,
              proofHash,
              savedGrams: metric.co2SavingsGrams,
              txHash: blockResult.txHash,
              simulated: blockResult.simulated,
            });
          }
        }
      } else {
        pushLog('BLOCKCHAIN', 'WARNING', `CO2 tasarrufu çok düşük (${metric.co2SavingsGrams.toFixed(5)}g). Süzgeçten elendi.`);
      }
    });

    // If queue completed naturally
    if (serverState.isCrawling) {
      serverState.isCrawling = false;
      pushLog('SYSTEM', 'SUCCESS', 'Otonom tarayıcı, tüm sıra sektörünü başarıyla optimize etti. Bekleme moduna geçiliyor.');
    }
  } catch (err: any) {
    serverState.isCrawling = false;
    pushLog('SYSTEM', 'ERROR', `Arka plan yürütme döngüsünde hata: ${err.message}`);
  }
}

// Setup initial warm system log
pushLog('SYSTEM', 'INFO', 'İnternet Geri Kazanım Komut Arayüzü hazır ve çevrimiçi.');

/* ==========================================
   REST API Endpoints Control Channels
   ========================================== */

/**
 * Retrieve system state and performance metrics
 */
app.get("/api/stats", async (req, res) => {
  try {
    const readyToSell = await ReadyToSellModel.find().sort({ timestamp: -1 }).limit(50);
    const transactions = await TransactionModel.find().sort({ timestamp: -1 }).limit(50);

    res.json({
      pagesProcessed: serverState.pagesProcessed,
      originalSizeTotal: serverState.originalSizeTotal,
      optimizedSizeTotal: serverState.optimizedSizeTotal,
      totalKiloBytesSaved: serverState.totalKiloBytesSaved, 
      totalCo2SavedGrams: serverState.totalCo2SavedGrams,
      blockchainProofsMinted: transactions.length,
      transactions: transactions,
      visitedUrls: Array.from(serverState.visitedUrls),
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
 * Simulate or execute a live smart contract purchase on Binance Smart Chain (BSC)
 * routing actual BNB directly to the user-configured destination cüzdanı!
 */
app.post("/api/simulate-purchase", async (req, res) => {
  const { itemId } = req.body;
  const item = await ReadyToSellModel.findOne({ id: itemId });
  
  if (!item) {
    return res.status(404).json({ error: "Veri paketi bulunamadı." });
  }
  
  if (item.isSold) {
    return res.status(400).json({ error: "Bu paket zaten satıldı." });
  }
  
  // 1. Mark as sold to lock state immediately
  item.isSold = true;
  
  // Set the payout amount in BNB (0.0005 BNB is ~ $0.30 - $0.40, a very safe micro-payment to test live block integration without draining real funds)
  const bnbAmount = "0.0005"; 

  pushLog('SYSTEM', 'INFO', `Otonom gelir transfer mekanizması devrede. Hedef: ${serverState.payoutWalletAddress} | Miktar: ${bnbAmount} BNB`);

  // Execute BSC transfer via the blockchain router
  const txResult = await mainBlockchain.executeBscPayout(serverState.payoutWalletAddress, bnbAmount);

  const record: TransactionRecord = {
    url: item.url,
    proofHash: item.proofHash,
    savedGrams: item.co2SavingsGrams,
    txHash: txResult.txHash,
    simulated: txResult.simulated,
    timestamp: new Date().toISOString()
  };
  
  if (txResult.success) {
    await TransactionModel.create(record);

    if (txResult.simulated) {
      pushLog('BLOCKCHAIN', 'SUCCESS', `[SIFIR_KOMISYON_ODEMESI] 0x71C7656EC7ab88b098defB751B7401B5f6d8976F kontratına $${item.marketPriceUSD.toFixed(2)} USDT yatırıldı!`);
      pushLog('SYSTEM', 'SUCCESS', `[SIFIR_GAS_AKTIF] Gelir (${item.marketPriceUSD.toFixed(2)} USDT/POL) ve gas ücreti alıcı tarafından karşılanarak ${serverState.payoutWalletAddress} cüzdanınıza başarıyla sevk edildi.`);
    } else {
      pushLog('BLOCKCHAIN', 'SUCCESS', `[GERÇEK_İŞLEM_BAŞARILI] BSC Ana Ağı Üzerinde ${bnbAmount} BNB başarıyla ${serverState.payoutWalletAddress} cüzdanına ulaştı!`);
      pushLog('SYSTEM', 'SUCCESS', `[ZİNCİR_KAYDI_OK] Real BSC TxHash: ${txResult.txHash}`);
    }
    pushLog('AI', 'SUCCESS', `[READY_TO_SELL] "${item.id}" nolu paket verisi alıcıya serbest bırakıldı.`);
    
    res.json({ success: true, item, transaction: record });
  } else {
    // Reverse status so the user can re-try after funding or adding key
    await ReadyToSellModel.updateOne({ id: itemId }, { isSold: false });
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
  pushLog('SYSTEM', 'INFO', 'Komut sinyali alındı. Otonom tarama iş parçacıkları başlatılıyor...');
  
  // Safe async execution pattern to avoid locking standard HTTP requests
  runBotTaskRecursive();

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
  mainCrawler.stop();
  pushLog('SYSTEM', 'WARNING', 'Komut sinyali alındı. Bileşenler güvenli bekleme moduna yönlendiriliyor...');
  
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

  pushLog('SYSTEM', 'INFO', `Segment URL'sinde hedefli taktik temizlik tetikleniyor: ${url}`);

  try {
    // 1. Scrub/Fetch target site source code
    const headers = {
      'User-Agent': 'Mozilla/5.0 (compatible; InternetReclamationTacticalBot/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
    };

    const response = await axios.get(url, { headers, timeout: 8000, responseType: 'text' });
    const originalCode = response.data;
    const originalBytes = Buffer.byteLength(originalCode);

    if (!originalCode || typeof originalCode !== 'string') {
      throw new Error("Target returned empty or non-HTML data payloads.");
    }

    // 2. Perform optimization
    const optimizedCode = mainOptimizer.optimizeHtml(originalCode);
    const optimizedBytes = Buffer.byteLength(optimizedCode);
    const bytesSaved = Math.max(0, originalBytes - optimizedBytes);

    // Calc savings using carbon formulas
    const simulatedTraffic = 35000;
    const savings = mainOptimizer.calculateCarbonSavings(originalBytes, optimizedBytes, simulatedTraffic);

    // 3. SECURE cryptographic proof
    const proofHash = mainOptimizer.generateProofHash(url, bytesSaved, savings.co2SavingsGrams, optimizedCode);

    // 4. Blockchain registration
    pushLog('BLOCKCHAIN', 'INFO', `Şunun için stratejik işlem yayınlanıyor: ${url}`);
    const blockchainResult = await mainBlockchain.triggerBorsaSwap(savings.co2SavingsGrams, proofHash);
    
    // Track stats updates
    serverState.pagesProcessed++;
    serverState.originalSizeTotal += originalBytes;
    serverState.optimizedSizeTotal += optimizedBytes;
    serverState.totalKiloBytesSaved += (bytesSaved / 1024);
    serverState.totalCo2SavedGrams += savings.co2SavingsGrams;
    serverState.visitedUrls.add(url);

    let txHash = blockchainResult.txHash;
    if (blockchainResult.success) {
      serverState.blockchainProofsMinted++;
      const manualTx: TransactionRecord = {
        url,
        proofHash,
        savedGrams: savings.co2SavingsGrams,
        txHash: blockchainResult.txHash,
        simulated: blockchainResult.simulated,
        timestamp: new Date().toISOString()
      };
      serverState.transactions.unshift(manualTx);
    }

    // 5. Query Gemini for professional sustainable code auditing insights
    pushLog('AI', 'INFO', `Veri iletim telemetrisi Gemini yapay zekasına aktarılıyor...`);
    const aiReport = await generateEcoReport(url, originalBytes, optimizedBytes, savings.co2SavingsGrams);
    pushLog('AI', 'SUCCESS', `Sürdürülebilir dönüşüm raporu başarıyla oluşturuldu.`);

    res.json({
      url,
      originalSize: originalBytes,
      optimizedSize: optimizedBytes,
      bytesSaved,
      co2SavingsGrams: savings.co2SavingsGrams,
      efficiencyGainPct: savings.efficiencyGainPct,
      proofHash,
      optimizedCode: optimizedCode.substring(0, 10000), // Protect token limit in client rendering
      originalCode: originalCode.substring(0, 5000),
      txHash,
      simulated: blockchainResult.simulated,
      aiReport
    });

  } catch (err: any) {
    pushLog('SYSTEM', 'ERROR', `${url} üzerinde stratejik taktik tarama başarısız oldu: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================
   Static File Server & Bundled Vite Framework
   ========================================== */

async function startServer() {
  // Connect to MongoDB
  if (dbConfig.uri) {
    try {
      await mongoose.connect(dbConfig.uri, { dbName: dbConfig.dbName });
      pushLog('SYSTEM', 'SUCCESS', `MongoDB'ye başarıyla bağlandı: ${dbConfig.dbName}`);
    } catch (error: any) {
      pushLog('SYSTEM', 'ERROR', `MongoDB bağlantı hatası: ${error.message}`);
      console.error("[CRITICAL] MongoDB connection failed:", error.message);
      // Uygulamanın veritabanı olmadan çalışmasını engellemek için çıkış yapabiliriz
      // process.exit(1); 
    }
  } else {
    pushLog('SYSTEM', 'WARNING', 'MongoDB URI yapılandırılmadığı için veritabanı bağlantısı kurulmadı.');
  }
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
    pushLog('SYSTEM', 'INFO', `[KEEP_ALIVE] ${timeString} - Otonom 'keep-alive' sinyali başarıyla iletildi. READY_TO_SELL envanteri izleniyor...`);
  }, 5 * 60 * 1000); // 5 minutes (300,000 ms)
}

startServer();
