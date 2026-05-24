/**
 * @file config.ts
 * @description Central configuration handler for blockchain and database settings.
 */

import * as dotenv from "dotenv";

// .env dosyasını açıkça yükle
const envResult = dotenv.config();
if (envResult.error && !process.env.PRIVATE_KEY) {
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
    commissionWallet: process.env.COMMISSION_WALLET || '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', // Aracı firma cüzdanı (Örn: Smart Gate)
    commissionRate: parseFloat(process.env.COMMISSION_RATE || '0.10'), // %10 Komisyon oranı
    rpcUrl: process.env.RPC_URL || 'https://polygon-rpc.com', // Varsayılan olarak Polygon Mainnet RPC
    privateKey: process.env.PRIVATE_KEY || process.env.INCOME_DISTRIBUTION_WALLET || '',
    zeroGasActive: false,
    networkMode: process.env.NETWORK_MODE || 'mainnet',
    useAiAnalysis: process.env.USE_AI_ANALYSIS === 'true',
    sharedPoolEnabled: process.env.SHARED_DISTRIBUTION_POOL_ENABLED === 'true',
    batchMining: process.env.BATCH_MINING === 'true',
    marketplaceApiUrl: process.env.MARKETPLACE_API_URL || 'https://api.gercek-veri-borsasi.com/v1/list', // Dış pazar yerinin API adresi
    oceanProtocolUrl: process.env.OCEAN_API_URL || 'https://ocean.api/v1/publish',
    middlewareWebhookUrl: process.env.MIDDLEWARE_URL || 'https://hook.make.com/your-webhook-id',
    openSeaApiUrl: process.env.OPENSEA_API_URL || 'https://api.opensea.io/v1/asset/create',
    googleSheetsUrl: process.env.GOOGLE_SHEETS_URL || 'https://script.google.com/macros/s/AKfycbxmke0-Fu1FuY0_W6dliNvjm7eH9tOlW2tfOzxJgkEZr2uLY7FIPZ4iDKmn1ZSoV8vo/exec'
};

export const dbConfig = {
    uri: mongoUri,
    dbName: process.env.CRAWLER_DB_NAME || 'geridonüşüm',
};
