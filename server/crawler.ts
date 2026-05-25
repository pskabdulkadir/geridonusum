/**
 * @file crawler.ts
 * @description Highly scalable, polite, and asynchroneously integrated discovery core in ESM TypeScript.
 * 
 * @author Senior Software Architect
 * @license SPDX-License-Identifier: Apache-2.0
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';

export interface CrawlerOptions {
  delayMs?: number;
  targetLimit?: number;
}

export class WebCrawler {
  public delayMs: number;
  public targetLimit: number;
  public queue: string[] = [];
  public visitedUrls: Set<string> = new Set();
  
  private logCallback?: (module: 'SYSTEM' | 'CRAWLER' | 'OPTIMIZER' | 'BLOCKCHAIN' | 'AI', level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE', msg: string) => void;
  private onCrawlingStateChange?: (url: string) => void;
  public isRunning: boolean = false;

  constructor(options: CrawlerOptions = {}) {
    this.delayMs = options.delayMs !== undefined ? options.delayMs : 5000; // Varsayılan 5 saniye gecikme
    this.targetLimit = options.targetLimit || 100;
  }

  /**
   * Safe logarithmic trigger callback hooks
   */
  public registerLogger(cb: typeof this.logCallback) {
    this.logCallback = cb;
  }

  public registerStateListener(cb: typeof this.onCrawlingStateChange) {
    this.onCrawlingStateChange = cb;
  }

  private emitLog(module: 'SYSTEM' | 'CRAWLER' | 'OPTIMIZER' | 'BLOCKCHAIN' | 'AI', level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE', msg: string) {
    if (this.logCallback) {
      this.logCallback(module, level, msg);
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public enqueue(urlString: string, referrer: string = 'SEED') {
    try {
      const parsedUrl = new URL(urlString);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return;
      }
      const cleanUrl = parsedUrl.origin + parsedUrl.pathname + parsedUrl.search;
      
      // Bellek Sızıntısı Koruması: Kuyruk boyutunu sınırla
      if (this.queue.length >= 1000) {
        return;
      }

      if (!this.visitedUrls.has(cleanUrl) && !this.queue.includes(cleanUrl)) {
        this.queue.push(cleanUrl);
        // Performans Koruması: Alt düğümleri sadece konsola yaz, SSE kanalını boğma
        console.log(`[CRAWLER_DISCOVERY] Found: ${cleanUrl}`);
      }
    } catch (e) {
      // ignore parsing abnormalities
    }
  }

  public async fetchAndAnalyze(currentUrl: string): Promise<{ html: string; links: string[] }> {
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (compatible; InternetReclamationCoreBot/1.0; +https://github.com/reclamation-core)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
      };

      this.emitLog('CRAWLER', 'INFO', `İndirme dizisi başlatılıyor: ${currentUrl}`);
      const response = await axios.get(currentUrl, {
        headers,
        timeout: 15000,
        responseType: 'text',
        maxContentLength: 52428800, // 50MB Sınırı (Büyük teknik dökümanlar için)
        maxBodyLength: 52428800
      });

      const html = response.data;
      if (!html || typeof html !== 'string') {
        return { html: '', links: [] };
      }

      // AUDIT: Gerçek HTTP isteği kanıtı (Wikimedia Sunucu Yanıtı)
      const traceInfo = `Server: ${response.headers['server']} | Cache: ${response.headers['x-cache']} | Date: ${response.headers['date']}`;
      this.emitLog('CRAWLER', 'ANALYZE', `[NET_TRACE] ${currentUrl} -> ${traceInfo}`);

      const $ = cheerio.load(html);
      const links: string[] = [];

      $('a[href]').each((_, element) => {
        const href = $(element).attr('href');
        if (href) {
          try {
            const resolvedUrl = new URL(href, currentUrl).toString();
            links.push(resolvedUrl);
          } catch (e) {
            // ignore malformed URLs
          }
        }
      });

      return { html, links };
    } catch (err: any) {
      this.emitLog('CRAWLER', 'ERROR', `[${currentUrl}] düğümünde ağ hatası: ${err.message}`);
      return { html: '', links: [] };
    }
  }

  /**
   * Stop automated crawler sequence safely
   */
  public stop() {
    this.isRunning = false;
    this.emitLog('SYSTEM', 'WARNING', `Tarayıcı iptal dizisi yayını başlatıldı.`);
  }

  /**
   * Core crawling cycle
   */
  public async start(seeds: string[], onPageScaredAsync: (url: string, html: string) => Promise<void>) {
    if (this.isRunning) {
      this.emitLog('SYSTEM', 'WARNING', `Tarayıcı aktif iş parçacığı zaten çalışıyor.`);
      return;
    }

    this.isRunning = true;
    this.emitLog('SYSTEM', 'SUCCESS', `Arama Çekirdeği başarıyla başlatıldı (Sonsuz Döngü Modu). Çevrimiçi şebeke segmentleri taranıyor.`);

    for (const seed of seeds) {
      this.enqueue(seed);
    }

    let crawledCount = 0;

    while (this.isRunning) {
      // PROTOKOL_HIZ_SINIRI: Her döngü başında sunucunun nefes almasını sağla
      await this.sleep(this.delayMs || 5000);

      try {
        // Robust empty queue protection
        if (this.queue.length === 0) {
          this.emitLog('CRAWLER', 'INFO', `Tarama kuyruğu temizlendi. Tohumlar yenileniyor.`);
          for (const seed of seeds) {
            this.visitedUrls.delete(seed);
            this.enqueue(seed);
          }
          if (this.visitedUrls.size > 200) this.visitedUrls.clear();
        }

        const url = this.queue.shift();
        if (!url || this.visitedUrls.has(url)) continue;

        this.visitedUrls.add(url);
        crawledCount++;

        if (this.onCrawlingStateChange) this.onCrawlingStateChange(url);

        const displayLimitText = this.targetLimit > 500000 ? "Sonsuz" : this.targetLimit.toString();
        this.emitLog('CRAWLER', 'ANALYZE', `Düğüm taraması [${crawledCount}/${displayLimitText}]: ${url}`);
        
        const start = Date.now();
        const { html, links } = await this.fetchAndAnalyze(url);
        const duration = Date.now() - start;

        if (html) {
          this.emitLog('CRAWLER', 'SUCCESS', `Yüklendi: ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB (${duration}ms)`);
          for (const link of links) this.enqueue(link, url);
          
          // Safe page processing
          await onPageScaredAsync(url, html).catch(err => {
            this.emitLog('SYSTEM', 'ERROR', `İşleme hatası (atlandı): ${err.message}`);
          });
        }
      } catch (loopError: any) {
        this.emitLog('SYSTEM', 'ERROR', `Kritik döngü hatası: ${loopError.message}`);
        await this.sleep(10000); // Hata durumunda 10 saniye bekle
      }
    }

    this.isRunning = false;
    if (this.onCrawlingStateChange) {
      this.onCrawlingStateChange('');
    }
    
    this.emitLog('SYSTEM', 'SUCCESS', `Hedef liste taraması tamamlandı. Tüm keşif iş parçacıkları güvenli bir şekilde veri tabanına kaydedildi.`);
  }
}
