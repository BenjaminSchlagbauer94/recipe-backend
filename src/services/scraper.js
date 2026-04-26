const axios = require('axios')
const cheerio = require('cheerio')
const anthropic = require('../lib/anthropic')

async function scrapeRecipe(url) {
  // ── Step 1: Fetch the page HTML ──────────────────────────
  let html
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
      },
    })
    html = response.data
  } catch (err) {
    throw new Error(`Could not fetch page: ${err.message}`)
  }

  const $ = cheerio.load(html)

  // ── Step 2a: Try JSON-LD structured data (Recipe schema) ─
  // Most modern recipe sites publish machine-readable JSON-LD.
  // This is more reliable than text extraction and saves AI tokens.
  const jsonLdRecipe = extractJsonLdRecipe($)

  if (jsonLdRecipe) {
    const ogImage =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      (Array.isArray(jsonLdRecipe.image)
        ? jsonLdRecipe.image[jsonLdRecipe.image.length - 1]
        : jsonLdRecipe.image) ||
      ''

    // Claude only needs to score nutrition — much cheaper than full extraction
    const scores = await scoreNutrition(jsonLdRecipe.ingredients)

    return {
      name: jsonLdRecipe.name,
      servings: jsonLdRecipe.servings,
      ingredients: jsonLdRecipe.ingredients,
      steps: jsonLdRecipe.steps,
      score_vitamins: scores.score_vitamins,
      score_proteins: scores.score_proteins,
      score_carbs: scores.score_carbs,
      image_url: ogImage,
    }
  }

  // ── Step 2b: Fall back to full-page text extraction ───────
  $('script, style, nav, footer, header, iframe, noscript, svg, [class*="ad"], [id*="ad"], [class*="cookie"], [class*="popup"], [class*="banner"]').remove()

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
  if (!contentText) contentText = $('body').text()

  const cleanText = contentText
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim()
    .slice(0, 12000)

  const ogImage =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content') ||
    $('img[class*="recipe"]').first().attr('src') ||
    $('article img').first().attr('src') ||
    ''

  // ── Step 3: Ask Claude to extract the full recipe ─────────
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

  const raw = message.content[0].text.trim()
  const jsonStr = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  let extracted
  try {
    extracted = JSON.parse(jsonStr)
  } catch (err) {
    throw new Error('Could not parse recipe data from AI response')
  }

  extracted.image_url = ogImage
  return extracted
}

// ── JSON-LD helpers ───────────────────────────────────────────

function extractJsonLdRecipe($) {
  const scripts = $('script[type="application/ld+json"]')
    .map((i, el) => $(el).html())
    .get()

  for (const s of scripts) {
    try {
      const parsed = JSON.parse(s)
      // Support both top-level Recipe and @graph arrays
      const nodes = parsed['@graph'] ? parsed['@graph'] : [parsed]

      for (const node of nodes) {
        const type = node['@type']
        const isRecipe =
          type === 'Recipe' ||
          (Array.isArray(type) && type.includes('Recipe'))
        if (!isRecipe || !node.name) continue

        const ingredients = mergeIngredients(
          (node.recipeIngredient || [])
            .map(i => decodeHtmlEntities(String(i).trim()))
            .filter(i => i.length > 0)
        )
        if (!ingredients.length) continue

        // recipeInstructions can be strings or HowToStep objects
        const steps = (node.recipeInstructions || [])
          .map(s => (typeof s === 'string' ? s : s.text || ''))
          .map(s => decodeHtmlEntities(s.trim()))
          .filter(s => s.length > 0)
        if (!steps.length) continue

        // recipeYield can be a number, string, or array like ["4", "4 Portion"]
        let servings = 4
        const yieldRaw = node.recipeYield
        if (yieldRaw) {
          const yieldStr = Array.isArray(yieldRaw)
            ? String(yieldRaw[0])
            : String(yieldRaw)
          const match = yieldStr.match(/\d+/)
          if (match) servings = parseInt(match[0], 10)
        }

        return { name: node.name, ingredients, steps, servings, image: node.image }
      }
    } catch (e) {
      // ignore malformed JSON-LD blocks
    }
  }

  return null
}

// Some sites accidentally split one ingredient across two JSON array entries
// when the original text had a comma inside parentheses, e.g.:
//   "1 L Milch (1"  +  "5 % Fett)"  →  "1 L Milch (1,5 % Fett)"
function mergeIngredients(ingredients) {
  const merged = []
  for (const ing of ingredients) {
    if (merged.length > 0) {
      const prev = merged[merged.length - 1]
      const openCount = (prev.match(/\(/g) || []).length
      const closeCount = (prev.match(/\)/g) || []).length
      if (openCount > closeCount) {
        merged[merged.length - 1] = prev + ',' + ing
        continue
      }
    }
    merged.push(ing)
  }
  return merged
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

// When using JSON-LD, Claude only needs to score nutrition — no full extraction needed.
async function scoreNutrition(ingredients) {
  const prompt = `Given these recipe ingredients, score the recipe on three nutritional dimensions from 1-10. Return ONLY valid JSON, no markdown, no explanation.

Ingredients:
${ingredients.join('\n')}

Return exactly:
{
  "score_vitamins": <integer 1-10, 10=very rich in vegetables/fruits/micronutrients, 1=almost none>,
  "score_proteins": <integer 1-10, 10=very high protein from meat/fish/eggs/legumes, 1=almost none>,
  "score_carbs": <integer 1-10, 10=complex healthy carbs, 1=mostly refined sugar or white flour>
}`

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 100,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].text.trim()
  const jsonStr = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  try {
    return JSON.parse(jsonStr)
  } catch (e) {
    return { score_vitamins: 5, score_proteins: 5, score_carbs: 5 }
  }
}

module.exports = { scrapeRecipe }
