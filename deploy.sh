#!/bin/bash
echo "--- Aegis Engine: Zero-Point Deployment Başlatılıyor ---"

# Sistem güncellemeleri ve Docker kurulumu
sudo apt-get update && sudo apt-get install -y docker.io docker-compose python3-pip

# Klasör yapısını oluştur
mkdir -p core agents trading finance utils data

# Python bağımlılıklarını kur (Ücretsiz araçlar)
pip3 install duckdb langchain_community requests web3 backtrader docker python-telegram-bot textblob prophet pandas ccxt praw

# Yerel Zeka Katmanı (Ollama) Kurulumu (Opsiyonel ama önerilir)
if ! command -v ollama &> /dev/null; then
    echo "Ollama (Yerel LLM) kuruluyor... Bu adım ücretsiz zeka katmanı için kritiktir."
    curl -fsSL https://ollama.com/install.sh | sh
fi

# Obfuscator'ı çalıştır (Kod gizleme protokolü başlat)
python3 obfuscator.py

echo "Aegis Engine hazır. 'docker-compose up -d' ile üretimi başlatın."
echo "UYARI: Mainnet cüzdanınızı finance/vault_manager.py üzerinden güvenli şekilde ekleyin."