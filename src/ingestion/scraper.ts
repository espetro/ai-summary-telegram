import { $ } from 'bun';
import { join } from 'path';

const VENV_TRAFILATURA = join(process.cwd(), '.venv', 'bin', 'trafilatura');

export interface ScrapeResult {
  text: string;
  title?: string;
  author?: string;
  status: 'full' | 'partial';
}

const BLOCKLIST = new Set(['instagram.com', 'linkedin.com']);

function isBlocked(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return BLOCKLIST.has(hostname) || BLOCKLIST.has(hostname.replace('www.', ''));
  } catch {
    return false;
  }
}

export async function checkTrafilaturaAvailable(): Promise<boolean> {
  try {
    const result = await $`${VENV_TRAFILATURA} --version`.quiet();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function checkInternetAccess(): Promise<boolean> {
  try {
    const response = await fetch('https://r.jina.ai/', { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    return response.status !== 0;
  } catch {
    return false;
  }
}

/**
 * Scrape content from URL using trafilatura (Python CLI) with Jina Reader fallback
 */
export async function scrapeContent(url: string): Promise<ScrapeResult> {
  // Check blocklist
  if (isBlocked(url)) {
    return scrapeWithJina(url);
  }

  // Try trafilatura first
  try {
    const result = await scrapeWithTrafilatura(url);
    return { ...result, status: 'full' };
  } catch (error) {
    console.warn(`Trafilatura failed for ${url}, falling back to Jina:`, error);
    return scrapeWithJina(url);
  }
}

/**
 * Use trafilatura Python CLI to extract full content
 */
async function scrapeWithTrafilatura(url: string): Promise<Omit<ScrapeResult, 'status'>> {
  try {
    const result = await $`${VENV_TRAFILATURA} --url ${url} --output-format json`.json();

    if (!result || typeof result !== 'object') {
      throw new Error('Invalid trafilatura response');
    }

    const text = result.text || result.content || '';
    const title = result.title || result.titletext;
    const author = result.author;

    if (!text || text.trim().length < 10) {
      throw new Error('No meaningful content extracted');
    }

    return { text: text.trim(), title, author };
  } catch (error) {
    throw new Error(`Trafilatura scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Use Jina Reader API as fallback for partial content
 */
async function scrapeWithJina(url: string): Promise<ScrapeResult> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(jinaUrl);

    if (!response.ok) {
      throw new Error(`Jina Reader API returned ${response.status}`);
    }

    const text = await response.text();

    if (!text || text.trim().length < 10) {
      throw new Error('No content from Jina Reader');
    }

    // Try to extract title from first line
    const lines = text.split('\n');
    const title = lines[0]?.trim();
    const contentText = lines.length > 1 ? lines.slice(1).join('\n').trim() : lines[0]?.trim() || '';

    return { text: contentText, title, status: 'partial' };
  } catch (error) {
    throw new Error(`Jina Reader fallback failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
