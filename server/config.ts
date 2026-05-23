/**
 * @file config.ts
 * @description Central configuration handler for blockchain and database settings.
 */

import * as dotenv from "dotenv";
dotenv.config();

export const blockchainConfig = {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    appUrl: process.env.APP_URL || '',
    contractAddress: process.env.CONTRACT_ADDRESS || process.env.SMART_GATE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000',
    payoutWallet: process.env.CHANNEL_ROUTING_WALLET || '0x02cc8aBBADf0ad5183f5e9Bb2BF469e506a133e4',
    rpcUrl: process.env.POLYGON_RPC_URL || process.env.RPC_URL || 'https://polygon-rpc.com',
    privateKey: process.env.PRIVATE_KEY || process.env.INCOME_DISTRIBUTION_WALLET || '',
    zeroGasActive: process.env.ZERO_GAS_SELLER_NODE === 'true',
    sharedPoolEnabled: process.env.SHARED_DISTRIBUTION_POOL_ENABLED === 'true',
    batchMining: process.env.BATCH_MINING === 'true',
};

export const dbConfig = {
    uri: process.env.MONGO_URI || '',
    dbName: process.env.CRAWLER_DB_NAME || 'geridönüşüm',
};