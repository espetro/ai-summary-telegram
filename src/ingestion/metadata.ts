import crypto from 'crypto';

export interface Metadata {
  title?: string;
  description?: string;
  image?: string;
  canonicalUrl: string;
  urlHash: string;
  domain: string;
  publishedAt?: Date;
}

/**
 * Extract metadata from a URL including Open Graph tags, canonical URL, and hash
 */
export async function extractMetadata(url: string): Promise<Metadata> {
  const domain = extractDomain(url);
  const urlHash = generateUrlHash(url);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CIB/1.0; +https://cib.app)',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const metadata = parseHtmlMetadata(html, url);

    return {
      ...metadata,
      canonicalUrl: metadata.canonicalUrl || url,
      urlHash,
      domain,
      publishedAt: metadata.publishedAt,
    };
  } catch (error) {
    console.warn(`Failed to fetch metadata for ${url}:`, error);
    // Return basic metadata on failure
    return {
      canonicalUrl: url,
      urlHash,
      domain,
    };
  }
}

/**
 * Parse HTML to extract Open Graph tags and other metadata
 */
function parseHtmlMetadata(html: string, fallbackUrl: string): Partial<Metadata> {
  const titleRegex = /<title[^>]*>([^<]*)<\/title>/i;
  const ogTitleRegex = /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["'][^>]*>/i;
  const ogDescRegex = /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["'][^>]*>/i;
  const ogImageRegex = /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["'][^>]*>/i;
  const canonicalRegex = /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["'][^>]*>/i;
  const twitterTitleRegex = /<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']*)["'][^>]*>/i;
  const twitterDescRegex = /<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']*)["'][^>]*>/i;
  const descRegex = /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i;

  let title: string | undefined;
  const titleMatch = html.match(ogTitleRegex) || html.match(twitterTitleRegex) || html.match(titleRegex);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].trim();
  }

  let description: string | undefined;
  const descMatch = html.match(ogDescRegex) || html.match(twitterDescRegex) || html.match(descRegex);
  if (descMatch && descMatch[1]) {
    description = descMatch[1].trim();
  }

  let image: string | undefined;
  const imageMatch = html.match(ogImageRegex);
  if (imageMatch && imageMatch[1]) {
    image = imageMatch[1].trim();
    // Convert relative URLs to absolute
    if (image && !image.startsWith('http')) {
      try {
        const baseUrl = new URL(fallbackUrl);
        image = new URL(image, baseUrl.origin).href;
      } catch {
        // Keep original if URL parsing fails
      }
    }
  }

  let canonicalUrl: string | undefined;
  const canonicalMatch = html.match(canonicalRegex);
  if (canonicalMatch && canonicalMatch[1]) {
    canonicalUrl = canonicalMatch[1].trim();
  }

  // Try to extract published date from various meta tags
  const articlePublishedRegex = /<meta[^>]*(?:property=["']article:published_time["']|name=["']published["']|name=["'date["'])[^>]*content=["']([^"']*)["'][^>]*>/i;
  const publishedMatch = html.match(articlePublishedRegex);
  let publishedAt: Date | undefined;
  if (publishedMatch && publishedMatch[1]) {
    try {
      publishedAt = new Date(publishedMatch[1]);
      if (isNaN(publishedAt.getTime())) {
        publishedAt = undefined;
      }
    } catch {
      publishedAt = undefined;
    }
  }

  return { title, description, image, canonicalUrl, publishedAt };
}

/**
 * Generate SHA-256 hash of a URL for deduplication
 */
function generateUrlHash(url: string): string {
  // Normalize URL: remove trailing slash, lowercase, remove www.
  const normalized = url
    .trim()
    .replace(/\/$/, '')
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, 'https://');

  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    // Remove www. prefix if present
    return hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}
