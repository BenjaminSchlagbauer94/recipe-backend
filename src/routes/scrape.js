const express = require('express')
const router = express.Router()
const { scrapeRecipe } = require('../services/scraper')

// POST /scrape
// Body: { url: "https://www.chefkoch.de/rezepte/..." }
// Returns: extracted recipe data ready to pre-fill the form
router.post('/', async (req, res) => {
  const { url } = req.body

  if (!url || !url.trim()) {
    return res.status(400).json({ error: 'URL is required' })
  }

  // Basic URL validation
  try {
    new URL(url)
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' })
  }

  try {
    console.log(`Scraping: ${url}`)
    const recipe = await scrapeRecipe(url)
    console.log(`Scraped successfully: ${recipe.name}`)
    res.json(recipe)
  } catch (err) {
    console.error('Scrape error:', err.message)
    res.status(422).json({
      error: 'Could not extract recipe from this page.',
      detail: err.message,
    })
  }
})

module.exports = router
