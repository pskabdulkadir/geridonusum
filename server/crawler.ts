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
        this.emitLog('CRAWLER', 'INFO', `Tespit edilen alt-düğüm: ${cleanUrl} (Referans: ${referrer})`);
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
        timeout: 8000,
        responseType: 'text',
        maxContentLength: 5242880, // 5MB Sınırı
        maxBodyLength: 5242880
      });

      const html = response.data;
      if (!html || typeof html !== 'string') {
        return { html: '', links: [] };
      }

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
      // Robust empty queue protection - Re-enqueue seeds and reset visited list if exhausted
      if (this.queue.length === 0) {
        this.emitLog('CRAWLER', 'INFO', `Tarama kuyruğu temizlendi. Yeni döngü için tohumlar yeniden yükleniyor.`);
        for (const seed of seeds) {
          this.visitedUrls.delete(seed);
          this.enqueue(seed);
        }
        // Occasional prune to allow re-visiting pages
        if (this.visitedUrls.size > 200) {
          this.visitedUrls.clear();
        }
      }

      const url = this.queue.shift();
      if (!url) {
        await this.sleep(this.delayMs || 1000);
        continue;
      }
      
      if (this.visitedUrls.has(url)) {
        continue;
      }

      this.visitedUrls.add(url);
      crawledCount++;

      if (this.onCrawlingStateChange) {
        this.onCrawlingStateChange(url);
      }

      const displayLimitText = this.targetLimit > 500000 ? "Sonsuz" : this.targetLimit.toString();
      this.emitLog('CRAWLER', 'ANALYZE', `Düğüm üzerinde tarama başlatılıyor [${crawledCount}/${displayLimitText}]: ${url}`);
      
      const start = Date.now();
      let html = '';
      let links: string[] = [];
      
      try {
        const result = await this.fetchAndAnalyze(url);
        html = result.html;
        links = result.links;
      } catch (err: any) {
        this.emitLog('CRAWLER', 'ERROR', `Hata koruması devrede. ${url} atlanıyor: ${err.message}`);
      }

      const duration = Date.now() - start;

      if (html) {
        this.emitLog('CRAWLER', 'SUCCESS', `Veri başarıyla yüklendi (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB, Süre: ${duration}ms).`);
        
        // Push newly excavated link routes
        for (const link of links) {
          this.enqueue(link, url);
        }

        // Trigger code optimization workflow under strict try-catch safety shield
        try {
          await onPageScaredAsync(url, html);
        } catch (optimizeError: any) {
          this.emitLog('SYSTEM', 'ERROR', `Optimizasyon motoru hatası (pasa geçiliyor): ${optimizeError.message}`);
        }
      }

      // Safe sleep mode - Energy preservation
      if (this.isRunning) {
        await this.sleep(this.delayMs);
      }
    }

    this.isRunning = false;
    if (this.onCrawlingStateChange) {
      this.onCrawlingStateChange('');
    }
    
    this.emitLog('SYSTEM', 'SUCCESS', `Hedef liste taraması tamamlandı. Tüm keşif iş parçacıkları güvenli bir şekilde veri tabanına kaydedildi.`);
  }
}
