import time
import os
import requests
import docker

class AegisWatchdog:
    def __init__(self):
        self.client = docker.from_env()
        self.telegram_token = os.getenv("TELEGRAM_TOKEN")
        self.chat_id = os.getenv("TELEGRAM_CHAT_ID")

    def send_alert(self, message):
        if self.telegram_token and self.chat_id:
            url = f"https://api.telegram.org/bot{self.telegram_token}/sendMessage"
            payload = {"chat_id": self.chat_id, "text": f"🚨 Aegis Watchdog: {message}"}
            try:
                requests.post(url, json=payload)
            except Exception as e:
                print(f"Telegram Hatası: {e}")

    def monitor(self):
        print("--- Aegis Watchdog: Üretim İzleme Başlatıldı ---")
        while True:
            for container in self.client.containers.list(all=True):
                if "aegis" in container.name:
                    if container.status != "running":
                        self.send_alert(f"{container.name} çöktü! Yeniden başlatılıyor...")
                        container.start()
                        self.send_alert(f"{container.name} başarıyla ayağa kaldırıldı.")
            
            # Kâr durumunu veya DB sağlığını buradan da kontrol edebilirsiniz
            time.sleep(300) # 5 dakikada bir kontrol

if __name__ == "__main__":
    watchdog = AegisWatchdog()
    watchdog.monitor()