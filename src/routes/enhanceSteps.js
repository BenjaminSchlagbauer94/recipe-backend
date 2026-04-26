const express = require('express')
const router = express.Router()
const anthropic = require('../lib/anthropic')

// Mirrors the unit list from src/lib/recipeUtils.js on the frontend
const UNITS =
  'EL|TL|MSP|Bund(?:e|es)?|Prise(?:n)?|Stück(?:e|es)?|Scheibe(?:n)?|Zehe(?:n)?' +
  '|Dose(?:n)?|Glas|Gläser|Flasche(?:n)?|Packung(?:en)?|Becher|Zweig(?:e)?' +
  '|Blatt|Blätter|Paar|Pkt|Spritzer|Liter' +
  '|g|kg|ml|l|cl|dl|tbsp?|tsp?|cups?|oz|lbs?' +
  '|pieces?|pcs?|slices?|bunch(?:es)?|pinch(?:es)?|handful|packs?|cans?|jars?|bottles?|bags?'

// Splits "4 Liter Gemüsebrühe" → { amount: "4 Liter", name: "Gemüsebrühe" }
// Returns null for ingredients with no parseable amount (e.g. "Salz und Pfeffer")
function parseIngredient(str) {
  const re = new RegExp(
    `^([\\d]+(?:[.,\\/][\\d]+)?(?:\\s+(?:${UNITS}))?)\\s+(.+)$`,
    'i'
  )
  const m = str.trim().match(re)
  if (!m) return null
  return { amount: m[1].trim(), name: m[2].trim() }
}

// POST /enhance-steps
// Body: { ingredients: string[], steps: string[] }
// Returns: { steps: string[] } — steps with amounts corrected to match ingredient list
router.post('/', async (req, res, next) => {
  try {
    const { ingredients, steps } = req.body
    if (!Array.isArray(ingredients) || !Array.isArray(steps)) {
      return res.status(400).json({ error: 'ingredients and steps must be arrays' })
    }
    if (steps.length === 0) return res.json({ steps: [] })

    // Parse ingredients into a clean name → amount mapping table
    const parsed = ingredients.map(parseIngredient).filter(Boolean)
    if (parsed.length === 0) return res.json({ steps })

    const mappingLines = parsed.map(p => `  "${p.name}" → ${p.amount}`).join('\n')

    const prompt = `You are editing a recipe's preparation steps to fix ingredient amounts.

Here is the authoritative table of ingredient names and their correct amounts:
${mappingLines}

Here are the preparation steps to fix:
${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Rules:
1. For each ingredient name from the table that appears in a step, the amount immediately before it must exactly match the table.
2. If the amount before the ingredient name is wrong or outdated, replace it with the correct one from the table.
3. If no amount appears before the ingredient name, insert the correct amount immediately before it.
4. If the amount is already correct, leave the step unchanged.
5. Do not change anything else — preserve all other wording, language, punctuation, and sentence structure exactly.

Return ONLY a valid JSON array of strings — one string per step, same order, same count as the input. No markdown, no explanation, no code fences.`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    let text = message.content[0].text.trim()
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

    const enhanced = JSON.parse(text)
    res.json({ steps: enhanced })
  } catch (err) {
    next(err)
  }
})

module.exports = router
