const axios = require('axios')
const cheerio = require('cheerio')
const anthropic = require('../lib/anthropic')

/**
 * Fetches a recipe URL, strips it down to readable text,
 * then asks Claude to extract all recipe details as JSON.
 */
async function scrapeRecipe(url) {
  // ── Step 1: Fetch the page HTML ──────────────────────────
  let html
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        // Pretend to be a real browser so sites don't block us
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
      },
    })
    html = response.data
  } catch (err) {
    throw new Error(`Could not fetch page: ${err.message}`)
  }

  // ── Step 2: Clean up HTML with Cheerio ───────────────────
  // Remove noise (scripts, styles, nav, ads) to save tokens
  const $ = cheerio.load(html)
  $('script, style, nav, footer, header, iframe, noscript, svg, [class*="ad"], [id*="ad"], [class*="cookie"], [class*="popup"], [class*="banner"]').remove()

  // Try to find the main recipe content area first
  const contentSelectors = [
    '[class*="recipe"]', '[id*="recipe"]',
    'article', 'main', '.content', '#content',
  ]
  let contentText = ''
  for (const sel of contentSelectors) {
    const el = $(sel).first()
    if (el.length && el.text().trim().length > 200) {
      contentText = el.text()
      break
    }
  }
  // Fallback to full body text
  if (!contentText) contentText = $('body').text()

  // Clean up whitespace
  const cleanText = contentText
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim()
    .slice(0, 12000) // Cap at ~12k chars to stay within token limits

  // Also try to grab the main image
  const ogImage = $('meta[property="og:image"]').attr('content') ||
                  $('meta[name="twitter:image"]').attr('content') ||
                  $('img[class*="recipe"]').first().attr('src') ||
                  $('article img').first().attr('src') || ''

  // ── Step 3: Ask Claude to extract the recipe ─────────────
  const prompt = `You are a recipe extraction assistant. Extract the recipe from the following webpage text and return ONLY a valid JSON object — no markdown, no explanation, just the JSON.

The JSON must have exactly this structure:
{
  "name": "Recipe name",
  "servings": 4,
  "ingredients": ["200g pasta", "2 cloves garlic", "..."],
  "steps": ["Boil water with salt.", "Cook pasta for 10 minutes.", "..."],
  "score_vitamins": 7,
  "score_proteins": 5,
  "score_carbs": 8
}

Rules:
- "name": the full recipe name
- "servings": a number (default to 4 if not mentioned)
- "ingredients": array of strings, each with amount + unit + ingredient name
- "steps": array of strings, each a clear complete cooking instruction. Split into individual steps — don't merge everything into one.
- "score_vitamins": integer 1-10 based on vegetable/fruit/micronutrient content (10 = very rich in vitamins)
- "score_proteins": integer 1-10 based on protein sources like meat, fish, eggs, legumes (10 = very high protein)
- "score_carbs": integer 1-10 based on carbohydrate quality (10 = complex healthy carbs, 1 = mostly refined sugar/white flour)

Webpage text:
${cleanText}`

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  // ── Step 4: Parse Claude's response ──────────────────────
  const raw = message.content[0].text.trim()

  // Strip any accidental markdown fences
  const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()

  let extracted
  try {
    extracted = JSON.parse(jsonStr)
  } catch (err) {
    throw new Error('Could not parse recipe data from AI response')
  }

  // Attach the image we found in step 2
  extracted.image_url = ogImage

  return extracted
}

module.exports = { scrapeRecipe }
