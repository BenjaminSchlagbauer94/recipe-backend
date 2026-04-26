const express = require('express')
const router = express.Router()
const supabase = require('../lib/supabase')
const { scrapeRecipe } = require('../services/scraper')
const {
  extractDomain,
  findRecipeUrls,
  classifyFoodType,
  classifyCategory,
  FALLBACK_DOMAINS,
} = require('../services/inspirationFinder')

// In-memory URL cache per domain — avoids re-crawling listing pages on every request
// { domain -> { urls: string[], ts: number } }
const urlCache = new Map()
const CACHE_TTL = 6 * 60 * 60 * 1000 // 6 hours

function getCached(domain) {
  const entry = urlCache.get(domain)
  if (!entry || Date.now() - entry.ts > CACHE_TTL) { urlCache.delete(domain); return null }
  return entry.urls
}
function setCache(domain, urls) {
  urlCache.set(domain, { urls, ts: Date.now() })
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// POST /inspirations
// Body: { excludeUrls?: string[], count?: number }
router.post('/', async (req, res, next) => {
  try {
    const { excludeUrls = [], count = 5 } = req.body

    // 1. Find domains the user already uses
    const { data: recipes, error } = await supabase
      .from('recipes')
      .select('source_url')
      .not('source_url', 'is', null)

    if (error) throw error

    const existingUrls = new Set(
      recipes.map(r => r.source_url && r.source_url.replace(/\/$/, '')).filter(Boolean)
    )
    const excludeSet = new Set([
      ...existingUrls,
      ...excludeUrls.map(u => u.replace(/\/$/, '')),
    ])

    let domains = [...new Set(
      recipes.map(r => extractDomain(r.source_url)).filter(Boolean)
    )].slice(0, 3)

    if (domains.length === 0) domains = FALLBACK_DOMAINS

    // 2. Collect candidate URLs from listing pages (cached after first call)
    let candidates = []
    for (const domain of domains) {
      let urls = getCached(domain)
      if (!urls) {
        urls = await findRecipeUrls(domain, excludeSet)
        if (urls.length) setCache(domain, urls)
      }
      const fresh = urls.filter(u => !excludeSet.has(u))
      candidates.push(...fresh.slice(0, count + 3))
    }

    candidates = shuffle(candidates)

    if (candidates.length === 0) {
      return res.json({ recipes: [], message: 'No new recipes found on your usual sites.' })
    }

    // 3. Scrape recipes in parallel (try more than needed, take first successes)
    const jobs = candidates.slice(0, Math.min(count * 2, 10)).map(url =>
      scrapeRecipe(url)
        .then(recipe => ({
          ...recipe,
          source_url: url,
          food_type: classifyFoodType(recipe.name, recipe.ingredients || []),
          recipe_category: classifyCategory(recipe.name),
        }))
        .catch(() => null)
    )

    const settled = await Promise.allSettled(jobs)
    const results = settled
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value)
      .slice(0, count)

    res.json({ recipes: results })
  } catch (err) {
    next(err)
  }
})

module.exports = router
