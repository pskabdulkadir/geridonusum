import requests
from bs4 import BeautifulSoup
import sqlite3
import duckdb
import json
from textblob import TextBlob
import os
import sys
import praw

# Core yollarını ekle
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

class SmartScraper:
    def __init__(self):
        self.queue_db = os.getenv('QUEUE_DB', 'data/aegis_queue.db')
        self.analytics_db = os.getenv('ANALYTICS_DB', 'data/aegis_analytics.db')
        self.queue_conn = sqlite3.connect(self.queue_db, check_same_thread=False)
        self.analytics_conn = duckdb.connect(self.analytics_db)
        
        # Sosyal Medya Bağlantısı (Reddit API)
        self.reddit = praw.Reddit(
            client_id=os.getenv("REDDIT_CLIENT_ID", "YOUR_ID"),
            client_secret=os.getenv("REDDIT_SECRET", "YOUR_SECRET"),
            user_agent="AegisEngine0.1"
        )
        self._setup_db()

    def _setup_db(self):
        # Görev kuyruğu
        self.queue_conn.execute("CREATE TABLE IF NOT EXISTS scrap_tasks (id INTEGER PRIMARY KEY, url TEXT, score REAL, status TEXT)")
        # DuckDB analitik tablo
        self.analytics_conn.execute("CREATE TABLE IF NOT EXISTS market_intelligence (source TEXT, insight TEXT, profitability_score REAL, sentiment_score REAL, timestamp TIMESTAMP)")

    def get_proxy(self):
        """Ücretsiz proxy havuzundan rotasyonel IP döner."""
        # Basitleştirilmiş: Burası ProxyBroker kütüphanesine bağlanacak
        return None 

    def analyze_profitability(self, content):
        """
        Agentic LLM Router: Veriyi yerel model (Ollama) ile puanlar.
        Maliyet: 0 TL (Yerel CPU/GPU kullanılır).
        """
        # Simüle edilmiş LLM Skoru (Gerçekte Ollama API'sine istek atar)
        # Eğer içerikte 'arbitrage', 'alpha' veya 'dip' gibi kelimeler varsa skor yükselir
        score = 0.0
        keywords = ['arbitrage', 'liquidity', 'whale', 'surge', 'listing']
        for word in keywords:
            if word in content.lower():
                score += 20.0
        return min(score, 100.0)

    def analyze_sentiment(self, content):
        """Metin üzerinden duygu analizi yapar (-1.0 ile 1.0 arası)."""
        analysis = TextBlob(content)
        return analysis.sentiment.polarity

    def get_social_sentiment(self, query="crypto"):
        """Reddit üzerinden topluluk duygu analizini yapar."""
        try:
            sentiments = []
            for submission in self.reddit.subreddit(query).hot(limit=10):
                analysis = TextBlob(submission.title)
                sentiments.append(analysis.sentiment.polarity)
            
            return sum(sentiments) / len(sentiments) if sentiments else 0
        except:
            # API anahtarı yoksa veya hata oluşursa nötr dön
            return 0.1 

    def run(self, target_url):
        print(f"[Aegis-Agent] Hedef taranıyor: {target_url}")
        try:
            response = requests.get(target_url, timeout=10)
            soup = BeautifulSoup(response.text, 'html.parser')
            text_content = soup.get_text()[:2000] # İlk 2000 karakter analiz için yeterli

            # Zeka Katmanı Devreye Giriyor
            p_score = self.analyze_profitability(text_content)
            s_score = self.analyze_sentiment(text_content)
            
            # Sosyal Medya Takviyesi
            social_score = self.get_social_sentiment("cryptocurrency")
            combined_sentiment = (s_score * 0.6) + (social_score * 0.4)
            
            if p_score > 50.0:
                print(f"[Aegis-Intelligence] Değerli veri! Kar: {p_score}, Kombine Duygu: {combined_sentiment}")
                # DuckDB'ye (Analitik Katman) yaz
                self.analytics_conn.execute(
                    "INSERT INTO market_intelligence VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
                    (target_url, "Kritik piyasa verisi tespit edildi.", p_score, combined_sentiment)
                )
                # SQLite kuyruğuna (Trading Katmanı için) ekle
                cursor = self.queue_conn.cursor()
                cursor.execute("INSERT INTO scrap_tasks (url, score, status) VALUES (?, ?, 'READY')", (target_url, p_score))
                self.queue_conn.commit()
            else:
                print(f"[Aegis-Discard] Düşük değerli veri atlandı. Skor: {p_score}")

        except Exception as e:
            print(f"[Aegis-Error] Tarama hatası: {e}")

if __name__ == "__main__":
    # Örnek başlangıç hedefleri
    targets = [
        "https://cryptopanic.com/",
        "https://www.coingecko.com/en/news"
    ]
    scraper = SmartScraper()
    for url in targets:
        scraper.run(url)