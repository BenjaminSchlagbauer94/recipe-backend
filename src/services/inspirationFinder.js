const axios = require('axios')
const cheerio = require('cheerio')

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
}

// Listing paths to try per domain, in priority order
const LISTING_PATHS = ['/rezepte', '/rezepte/', '/recipes', '/recipes/', '/alle-rezepte/', '/']

// Fallback domains if the user has no scraped recipes yet
const FALLBACK_DOMAINS = ['www.chefkoch.de', 'www.einfachkochen.de']

function extractDomain(url) {
  try { return new URL(url).hostname } catch { return null }
}

function isLikelyRecipeUrl(href, domain) {
  const path = href.replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '')
  const lower = path.toLowerCase()

  // Reject non-recipe paths
  if (/\/(kategorie|category|tag[s]?|autor|author|ueber|about|kontakt|contact|datenschutz|impressum|agb|suche|search|login|register|shop|cart|wp-content|feed)\b/i.test(lower)) return false
  if (/\.(jpg|jpeg|png|gif|pdf|xml|json|css|js)$/i.test(lower)) return false
  if (!href.includes(domain)) return false

  // Root path only → not a recipe
  const segments = path.replace(/\/$/, '').split('/').filter(Boolean)
  if (segments.length === 0) return false

  // Strong positive: URL contains "rezept" or "recipe"
  if (lower.includes('rezept') || lower.includes('recipe')) return true

  // Slug-style sites (e.g. schuesselglueck.de): single path segment, long, hyphenated
  if (segments.length === 1 && segments[0].includes('-') && segments[0].length > 14) return true

  return false
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function findRecipeUrls(domain, excludeSet) {
  for (const path of LISTING_PATHS) {
    try {
      const res = await axios.get(`https://${domain}${path}`, {
        timeout: 12000,
        headers: HEADERS,
        maxRedirects: 5,
      })
      const $ = cheerio.load(res.data)
      const found = new Set()

      $('a[href]').each((_, el) => {
        let href = $(el).attr('href') || ''
        if (href.startsWith('/')) href = `https://${domain}${href}`
        if (!href.startsWith('http')) return
        href = href.split('?')[0].split('#')[0].replace(/\/$/, '')
        if (excludeSet.has(href) || excludeSet.has(href + '/')) return
        if (isLikelyRecipeUrl(href, domain)) found.add(href)
      })

      if (found.size >= 4) return shuffle([...found])
    } catch {
      // try next path
    }
  }
  return []
}

// Keyword-based classification — no AI needed, fast
function classifyFoodType(name, ingredients) {
  const text = `${name} ${(ingredients || []).join(' ')}`.toLowerCase()
  const isFish = /(lachs|thunfisch|garnele|shrimp|fisch\b|fish\b|salmon|tuna|prawn|meeresfrüchte|seafood|hering|makrele|forelle|kabeljau|tilapia|muschel|crevette)/.test(text)
  const isMeat = /(rindfleisch|hackfleisch|hähnchen|huhn\b|schweinefleisch|lamm\b|beef|chicken|pork|lamb\b|fleisch\b|meat\b|wurst|schinken|speck|bacon|turkey|puten|kalb|veal|steak|bratwurst|geflügel)/.test(text)
  const isDairy = /(milch|butter|käse|sahne|ei\b|eier|joghurt|milk|cheese|cream\b|egg\b|eggs|yogurt|quark|mascarpone)/.test(text)

  if (isFish) return 'Fish'
  if (isMeat) return 'Meat'
  if (!isDairy) return 'Vegan'
  return 'Vegetarian'
}

function classifyCategory(name) {
  const t = name.toLowerCase()
  if (/(suppe|soup|salat\b|salad|vorspeise|starter|bruschetta|antipast|dip\b|hummus|crostini|carpaccio|tatar|terrine|brot.*aufstrich)/.test(t)) return 'Starters'
  if (/(kuchen|torte|muffin|cookie|keks|dessert|tiramisu|mousse|pudding\b|eis\b|ice cream|brownie|waffel|waffle|pancake|crepe|tart\b|pie\b|parfait|cheesecake|crumble|panna cotta|schokolade.*creme)/.test(t)) return 'Desserts'
  if (/(smoothie|juice|saft\b|cocktail|drink\b|shake\b|tee\b|tea\b|kaffee|coffee|limonade|lemonade|punsch|punch\b)/.test(t)) return 'Drinks'
  return 'Main Dishes'
}

module.exports = { extractDomain, findRecipeUrls, classifyFoodType, classifyCategory, FALLBACK_DOMAINS }
