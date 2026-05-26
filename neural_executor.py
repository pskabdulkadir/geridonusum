import backtrader as bt
import duckdb
import pandas as pd
from prophet import Prophet
import os

class AegisScoreStrategy(bt.Strategy):
    """
    Aegis Engine için temel skor tabanlı strateji.
    Smart-Scraper'dan gelen kârlılık skorlarını al/sat sinyallerine dönüştürür.
    """
    params = (('threshold', 70),)

    def __init__(self):
        self.dataclose = self.datas[0].close
        self.score = self.datas[0].score

    def next(self):
        if not self.position:
            # Skor eşiğin üzerindeyse AL
            if self.score[0] > self.params.threshold:
                self.buy()
        else:
            # Skor düştüğünde SAT
            if self.score[0] < self.params.threshold - 10:
                self.sell()

class NeuralExecutor:
    def __init__(self):
        self.db_path = os.getenv('ANALYTICS_DB', 'data/aegis_analytics.db')
        self.champion_path = 'trading/champion_config.json'

    def fetch_data_from_duckdb(self):
        """DuckDB verilerini Pandas DataFrame'e dönüştürür."""
        con = duckdb.connect(self.db_path)
        # Analitik verileri ve simüle edilmiş fiyatları alıyoruz
        df = con.execute("""
            SELECT 
                timestamp as datetime,
                profitability_score as score,
                100.0 as close,  # Gerçek API entegrasyonuna kadar sabit fiyat
                100.0 as open,
                100.0 as high,
                100.0 as low,
                0 as volume
            FROM market_intelligence
            ORDER BY timestamp ASC
        """).df()
        con.close()
        return df

    def forecast_trend(self, df):
        """Prophet ile gelecek fiyat/skor trendini tahmin eder."""
        if len(df) < 10: return 0
        
        # Prophet formatı: ds ve y sütunları
        prophet_df = df[['datetime', 'score']].rename(columns={'datetime': 'ds', 'score': 'y'})
        prophet_df['ds'] = pd.to_datetime(prophet_df['ds']).dt.tz_localize(None)
        
        model = Prophet(yearly_seasonality=False, daily_seasonality=True)
        model.fit(prophet_df)
        
        future = model.make_future_dataframe(periods=6, freq='H')
        forecast = model.predict(future)
        # Son tahminin yönünü döndür
        return forecast['yhat'].iloc[-1]

    def run_strategy_evolution(self):
        """Darwinist Strateji Seçimi: En yüksek Sharpe Ratio'yu bulur."""
        print("[Neural-Trading] Strateji evrimi başlatılıyor...")
        
        df = self.fetch_data_from_duckdb()
        if df.empty:
            print("[Neural-Trading] Yetersiz veri. Evrim atlanıyor.")
            return None

        data = bt.feeds.PandasData(dataname=df, name='AegisAnalytics')
        
        # Farklı eşik değerlerini test et (Evrim)
        best_score = -1
        best_threshold = 70
        
        for test_threshold in [60, 70, 80, 90]:
            cerebro = bt.Cerebro()
            cerebro.addstrategy(AegisScoreStrategy, threshold=test_threshold)
            cerebro.adddata(data)
            cerebro.broker.setcash(1000.0)
            
            # Backtest çalıştır
            cerebro.run()
            final_value = cerebro.broker.getvalue()
            
            if final_value > best_score:
                best_score = final_value
                best_threshold = test_threshold

        print(f"[Neural-Trading] Şampiyon Parametresi Bulundu: Threshold={best_threshold} (Final Value: {best_score})")
        
        # Şampiyonu kaydet
        self._save_champion(best_threshold)
        return best_threshold

    def _save_champion(self, threshold):
        import json
        with open(self.champion_path, 'w') as f:
            json.dump({'champion_threshold': threshold}, f)

if __name__ == "__main__":
    executor = NeuralExecutor()
    executor.run_strategy_evolution()