/**
 * @file config.ts
 * @description Central configuration handler for blockchain and database settings.
 */

import * as dotenv from "dotenv";

// .env dosyasını açıkça yükle
const envResult = dotenv.config();
if (envResult.error) {
  console.warn("⚠️  .env dosyası bulunamadı, varsayılan değerler kullanılıyor.");
}

// Debug: Ortam değişkenlerini kontrol et
console.log("DEBUG: PRIVATE_KEY kontrolü:", process.env.PRIVATE_KEY ? "YÜKLÜ" : "BOŞ!");
console.log("DEBUG: MONGO_URI kontrolü:", process.env.MONGO_URI ? "YÜKLÜ" : "BOŞ (varsayılan kullanılacak)");

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://Abdulkadir1983:Abdulkadir1983@cluster0.ukjckex.mongodb.net/geridonüşüm?retryWrites=true&w=majority&appName=Cluster0';

export const blockchainConfig = {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    appUrl: process.env.APP_URL || '',
    contractAddress: process.env.CONTRACT_ADDRESS || process.env.SMART_GATE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000',
    payoutWallet: process.env.CHANNEL_ROUTING_WALLET || process.env.PAYOUT_WALLET || '0x02cc8aBBADf0ad5183f5e9Bb2BF469e506a133e4',
    rpcUrl: process.env.RPC_URL || 'https://bsc-dataseed.binance.org/',
    privateKey: process.env.PRIVATE_KEY || process.env.INCOME_DISTRIBUTION_WALLET || '',
    zeroGasActive: false,
    networkMode: process.env.NETWORK_MODE || 'mainnet',
    useAiAnalysis: process.env.USE_AI_ANALYSIS === 'true',
    sharedPoolEnabled: process.env.SHARED_DISTRIBUTION_POOL_ENABLED === 'true',
    batchMining: process.env.BATCH_MINING === 'true',
};

export const dbConfig = {
    uri: mongoUri,
    dbName: process.env.CRAWLER_DB_NAME || 'geridonüşüm',
};
