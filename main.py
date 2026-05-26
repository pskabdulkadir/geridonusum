import requests
from bs4 import BeautifulSoup
import time
import random
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database.queue_manager import QueueManager

def get_free_proxies():
    # Ücretsiz proxy listesi çeken basit bir fonksiyon
    url = "https://free-proxy-list.net/"
    response = requests.get(url)
    soup = BeautifulSoup(response.text, 'html.parser')
    proxies = []
    for row in soup.find_all('tr')[1:]:
        cols = row.find_all('td')
        if cols and cols[4].text == 'elite proxy':
            proxies.append(f"http://{cols[0].text}:{cols[1].text}")
    return proxies

def run_scraper():
    queue = QueueManager()
    proxies = get_free_proxies()
    
    targets = ["https://news.ycombinator.com", "https://finance.yahoo.com"]
    
    while True:
        proxy = random.choice(proxies) if proxies else None
        for target in targets:
            try:
                print(f"Scraping {target} via {proxy}")
                queue.enqueue("NLP_PROCESS", {"url": target, "data": "Raw data sample"})
            except Exception as e:
                print(f"Error: {e}")
        time.sleep(60)

if __name__ == "__main__":
    run_scraper()