#!/bin/bash

echo "Sıfır Maliyetli Hive-Mind Kurulumu Başlatılıyor..."

# Update & Install Docker
sudo apt-get update
sudo apt-get install -y docker.io docker-compose python3-pip

# Requirements install
pip3 install -r requirements.txt

# NLP model download (spaCy)
python3 -m spacy download en_core_web_sm

echo "Sistem hazır. 'docker-compose up -d' komutu ile otonom döngüyü başlatabilirsiniz."