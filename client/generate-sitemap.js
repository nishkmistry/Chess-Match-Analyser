// generate-sitemap.js
// Run this script before building to generate a fresh sitemap.xml
// It fetches all match IDs from the API and writes sitemap.xml to public/

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = 'https://chess-match-analyser.netlify.app';
const API_URL = 'https://chess-match-analyser.netlify.app/api/matches';
const OUTPUT_PATH = path.join(__dirname, 'public', 'sitemap.xml');

// Static routes with their SEO metadata
const STATIC_ROUTES = [
  {
    loc: '/',
    lastmod: new Date().toISOString().split('T')[0],
    changefreq: 'daily',
    priority: '1.0',
  },
];

function buildUrl(route) {
  return `${BASE_URL}${route}`;
}

function buildUrlEntry({ loc, lastmod, changefreq, priority }) {
  return `
  <url>
    <loc>${buildUrl(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

async function fetchMatchIds() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`API responded with status ${res.status}`);
    const matches = await res.json();
    return matches.map((m) => m.match_id).filter(Boolean);
  } catch (err) {
    console.warn(`⚠️  Could not fetch match IDs: ${err.message}`);
    console.warn('   Sitemap will only include static routes.');
    return [];
  }
}

async function generateSitemap() {
  console.log('🗺️  Generating sitemap.xml...');

  const today = new Date().toISOString().split('T')[0];

  // Build static route entries
  const staticEntries = STATIC_ROUTES.map(buildUrlEntry).join('');

  // Fetch dynamic match IDs
  const matchIds = await fetchMatchIds();
  console.log(`   Found ${matchIds.length} match(es) for dynamic URLs.`);

  const dynamicEntries = matchIds
    .map((id) =>
      buildUrlEntry({
        loc: `/analysis/${id}`,
        lastmod: today,
        changefreq: 'weekly',
        priority: '0.7',
      })
    )
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticEntries}${dynamicEntries}
</urlset>
`;

  fs.writeFileSync(OUTPUT_PATH, xml, 'utf-8');
  console.log(`✅  Sitemap written to: ${OUTPUT_PATH}`);
  console.log(`   Total URLs: ${STATIC_ROUTES.length + matchIds.length}`);
}

generateSitemap();
