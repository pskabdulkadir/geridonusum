class KillSwitch:
    def __init__(self, max_drawdown=0.10):
        self.max_drawdown = max_drawdown
        self.peak_balance = 0
        self.is_halted = False

    def check_safety(self, current_balance):
        """Bakiyeyi kontrol eder ve drawdown eşiği aşılırsa sistemi durdurur."""
        if current_balance > self.peak_balance:
            self.peak_balance = current_balance

        if self.peak_balance > 0:
            drawdown = (self.peak_balance - current_balance) / self.peak_balance
            
            if drawdown >= self.max_drawdown:
                self.trigger_halt(drawdown)
                return False
        
        return True

    def trigger_halt(self, drawdown):
        self.is_halted = True
        print(f"!!! [KILL-SWITCH] KRİTİK HATA: %{drawdown*100:.2f} drawdown tespit edildi.")
        print("!!! [HALT] Tüm operasyonlar güvenlik amacıyla durduruldu.")