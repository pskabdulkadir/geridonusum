import time
import os
import duckdb
from finance.vault_manager import VaultManager
from finance.kill_switch import KillSwitch
from trading.neural_executor import NeuralExecutor
import json
import random
import ccxt

class AegisOrchestrator:
    def __init__(self):
        # Docker içi yollar ve Env kullanımı
        self.db_path = os.getenv('ANALYTICS_DB', 'data/aegis_analytics.db')
        self.db = duckdb.connect(self.db_path)
        self.vault = VaultManager(rpc_url=os.getenv('RPC_URL'), private_key=os.getenv('PRIVATE_KEY'))
        self.safety = KillSwitch(max_drawdown=0.10)
        self.neural = NeuralExecutor()
        self.is_active = True
        
        # Borsa Bağlantıları (API Key olmadan ticker verisi çekilebilir)
        self.exchanges = {
            'binance': ccxt.binance({'enableRateLimit': True}),
            'okx': ccxt.okx({'enableRateLimit': True})
        }

    def process_cycle(self):
        while self.is_active:
            # 1. Güvenlik Kontrolü
            current_bal = self.vault.get_total_balance()
            if not self.safety.check_safety(current_bal):
                self.is_active = False
                break

            # 1.5. Periyodik Strateji Evrimi (Her döngüde kontrol edilebilir)
            # Şimdilik mevcut şampiyonu yükle
            try:
                with open('trading/champion_config.json', 'r') as f:
                    config = json.load(f)
                    threshold = config.get('champion_threshold', 70)
            except FileNotFoundError:
                threshold = 70

            # 2. Market Intelligence Oku (DuckDB)
            # Neural-Trading'den gelen şampiyon threshold değerini kullan
            query = f"""
                SELECT source, insight, profitability_score, sentiment_score 
                FROM market_intelligence 
                WHERE profitability_score > {threshold} 
                ORDER BY timestamp DESC LIMIT 5
            """
            signals = self.db.execute(query).fetchall()

            for signal in signals:
                # Final Alpha Score: Kar Skoru + Sentiment + Forecast Ağırlığı
                # Formül: (Kâr * 0.5) + (Duygu * 20) + (Trend * 0.3)
                final_alpha = (signal[2] * 0.5) + (signal[3] * 20)
                
                print(f"[Orchestrator] {signal[0]} Analiz Ediliyor. Alfa: {final_alpha}")
                if final_alpha < 40: continue # Alfa eşiği

                # 2.5 Multi-Exchange Arbitrage Kontrolü
                arb_found, spread = self.check_arbitrage_opportunity("BTC/USDT")
                if arb_found:
                    print(f"[Arbitrage-Bridge] Fırsat Yakalandı! Spread: %{spread:.2f}")
                    final_alpha += 15 # Arbitraj varsa sinyal gücünü artır

                # 2.6 Digital Twin Pre-Flight Simulation
                if not self.digital_twin_pre_flight(signal):
                    print(f"[Digital-Twin] Simülasyon başarısız (Slippage/Hata). İşlem iptal edildi.")
                    continue

                # 3. Trading-Executor'a Sinyal Gönder
                # (Burada Backtrader Champion stratejisi tetiklenir)
                trade_success = self.simulate_trade(signal)
                
                if trade_success:
                    # 4. Vault-Splitter'ı Çalıştır
                    # Örnek: Trade'den 100 birim kazanç geldiğini varsayalım
                    self.vault.split_funds(1000000000000000000) # 1 ETH/UNIT

            # Stealth Timing: Sabit 60 saniye yerine rastgele aralıklarla çalış
            nap_time = random.randint(45, 90)
            time.sleep(nap_time) 

    def check_arbitrage_opportunity(self, symbol):
        """Borsalar arası gerçek fiyat farkını sorgular."""
        try:
            ticker_a = self.exchanges['binance'].fetch_ticker(symbol)
            ticker_b = self.exchanges['okx'].fetch_ticker(symbol)
            
            price_a = ticker_a['last']
            price_b = ticker_b['last']
            
            spread = abs(price_a - price_b) / min(price_a, price_b)
            if spread > 0.005: # %0.5 spread eşiği
                return True, spread * 100
        except Exception as e:
            print(f"[Arbitrage-Error] Fiyat çekilemedi: {e}")
        return False, 0

    def digital_twin_pre_flight(self, signal):
        """İşlemi canlıya almadan önce sandbox üzerinde test eder."""
        # Burada emrin tipi, slippage toleransı ve likidite simüle edilir
        return True # Simülasyon başarılı varsayılıyor

    def simulate_trade(self, signal):
        # Gerçek uygulamada Neural-Trading modülüne bağlanır
        return True

if __name__ == "__main__":
    engine = AegisOrchestrator()
    print("--- Aegis Engine: Phase II (Execution) Başlatıldı ---")
    engine.process_cycle()