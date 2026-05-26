import sys
import os
from finance.vault_manager import VaultManager
from finance.kill_switch import KillSwitch
import duckdb

def run_ping_pong():
    print("--- Aegis Engine: Mainnet Ping-Pong Testi Başlatılıyor ---")
    
    # 1. Veritabanı Bağlantı Testi
    try:
        db = duckdb.connect('c:/Users/acer/Desktop/mustafa/cekcek/data/aegis_analytics.db')
        print("[OK] DuckDB analitik katmanı erişilebilir.")
    except Exception as e:
        print(f"[FAIL] Veritabanı hatası: {e}")
        return

    # 2. Vault & Web3 Bağlantı Testi
    # NOT: .env veya config üzerinden gerçek RPC ve Key çekilmelidir.
    # Bu test 0.0001 MATIC ile gerçek bir on-chain hareketi tetikler.
    rpc = "https://polygon-rpc.com"
    key = os.getenv("PRIVATE_KEY", "YOUR_KEY_HERE")
    
    if key == "YOUR_KEY_HERE":
        print("[SKIP] PRIVATE_KEY ayarlanmadığı için on-chain transfer atlanıyor.")
        return

    vault = VaultManager(rpc_url=rpc, private_key=key)
    safety = KillSwitch(max_drawdown=0.10)

    # 3. Bakiye ve Güvenlik Kontrolü
    balance = vault.get_total_balance()
    print(f"[INFO] Mevcut Cüzdan Bakiyesi: {balance} wei")
    
    if not safety.check_safety(balance):
        print("[FAIL] Kill-Switch güvenliği geçemedi. Test durduruldu.")
        return

    # 4. Ping-Pong Transferi (Küçük bir miktar dağıtımı test et)
    # Bu işlem gerçek gas fee harcar (yaklaşık $0.01)
    print("[ACTION] 0.0001 MATIC Ping-Pong transferi başlatılıyor...")
    ping_amount = 100000000000000 # 0.0001 MATIC
    
    try:
        vault.split_funds(ping_amount)
        print("[SUCCESS] Ping-Pong testi başarılı. Aegis Engine Mainnet'e hazır!")
    except Exception as e:
        print(f"[FAIL] Transfer hatası: {e}")

if __name__ == "__main__":
    run_ping_pong()