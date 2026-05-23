/**
 * @file config.ts
 * @description Central configuration handler for blockchain and database settings.
 */

import * as dotenv from "dotenv";
dotenv.config();

export const blockchainConfig = {
    contractAddress: process.env.SMART_GATE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000',
    payoutWallet: process.env.CHANNEL_ROUTING_WALLET || '0x89205AbaE846560FDeB791CfFEE17482D2Ec739D',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    privateKey: process.env.INCOME_DISTRIBUTION_WALLET || '',
    zeroGasActive: process.env.ZERO_GAS_SELLER_NODE === 'true',
    sharedPoolEnabled: process.env.SHARED_DISTRIBUTION_POOL_ENABLED === 'true',
};

export const dbConfig = {
    uri: process.env.MONGO_URI || '',
    dbName: process.env.CRAWLER_DB_NAME || 'geridönüşüm',
};