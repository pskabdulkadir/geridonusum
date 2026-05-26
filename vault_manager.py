from web3 import Web3
import requests
import os
import json

class ContractValidator:
    @staticmethod
    def is_safe(contract_address):
        """Kontratın Honeypot olup olmadığını kontrol eder (API Entegrasyonu)."""
        if not contract_address or contract_address == "0x": return True
        try:
            # Örnek API çağrısı (Honeypot.is veya benzeri)
            response = requests.get(f"https://api.honeypot.is/v2/IsHoneypot?address={contract_address}")
            data = response.json()
            return not data.get("honeypot", {}).get("isHoneypot", False)
        except:
            # API hatası durumunda temkinli yaklaş (False dönebilirsin)
            return True

class VaultManager:
    def __init__(self, rpc_url, private_key):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        self.account = self.w3.eth.account.from_key(private_key)
        
        # Dağıtım Oranları (%)
        self.RATIOS = {
            "OPERATIONAL": 0.50, # Gas, Proxy, Sunucu
            "LIQUIDITY": 0.30,   # Trading sermayesi
            "RESERVE": 0.20      # Kar birikimi / Acil durum
        }
        
        # Cüzdan Adresleri (Yapılandırmadan gelir)
        self.VAULTS = {
            "OPERATIONAL": os.getenv("OP_WALLET"),
            "LIQUIDITY": os.getenv("LIQ_WALLET"),
            "RESERVE": os.getenv("RES_WALLET")
        }
        # Gaz tavanı (Gwei cinsinden) - Ağ bu değerden pahalıysa bekle
        self.GAS_LIMIT_GWEI = int(os.getenv("MAX_GAS_GWEI", "200"))
        self.validator = ContractValidator()

    def split_funds(self, amount_wei, target_contract=None):
        """Gelen tutarı oranlara göre dağıtır."""
        if target_contract and not self.validator.is_safe(target_contract):
            print(f"!!! [SECURITY] Rug-Pull riski tespit edildi: {target_contract}")
            return False

        print(f"[Vault] Dağıtım başlatılıyor: {self.w3.from_wei(amount_wei, 'ether')} UNIT")
        
        for category, ratio in self.RATIOS.items():
            split_amount = int(amount_wei * ratio)
            target_address = self.VAULTS[category]
            
            if target_address:
                self._send_transaction(target_address, split_amount, category)

    def get_dynamic_gas_price(self):
        """Ağın güncel gaz ücretini sorgular ve limit kontrolü yapar."""
        current_gas_price = self.w3.eth.gas_price
        gas_gwei = self.w3.from_wei(current_gas_price, 'gwei')
        
        if gas_gwei > self.GAS_LIMIT_GWEI:
            print(f"[Gas-Optimizer] Ağ yoğunluğu yüksek ({gas_gwei:.2f} Gwei). İşlem erteleniyor...")
            return None
        
        return current_gas_price

    def _send_transaction(self, to_address, amount, category):
        try:
            gas_price = self.get_dynamic_gas_price()
            if gas_price is None: return None # Gaz çok yüksekse işlemi iptal et

            nonce = self.w3.eth.get_transaction_count(self.account.address)
            tx = {
                'nonce': nonce,
                'to': to_address,
                'value': amount,
                'gas': 21000,
                'gasPrice': gas_price,
                'chainId': 137 # Polygon Mainnet
            }
            
            signed_tx = self.w3.eth.account.sign_transaction(tx, self.account.key)
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.rawTransaction)
            
            print(f"[Vault-Success] {category} aktarımı başarılı. Hash: {tx_hash.hex()}")
            return tx_hash.hex()
        except Exception as e:
            print(f"[Vault-Error] {category} aktarımı başarısız: {e}")
            return None

    def get_total_balance(self):
        """Ana cüzdan bakiyesini döner."""
        return self.w3.eth.get_balance(self.account.address)