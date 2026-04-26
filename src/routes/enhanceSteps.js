const express = require('express')
const router = express.Router()
const anthropic = require('../lib/anthropic')

// POST /enhance-steps
// Body: { ingredients: string[], steps: string[] }
// Returns: { steps: string[] } — steps with amounts injected before each ingredient name
router.post('/', async (req, res, next) => {
  try {
    const { ingredients, steps } = req.body
    if (!Array.isArray(ingredients) || !Array.isArray(steps)) {
      return res.status(400).json({ error: 'ingredients and steps must be arrays' })
    }
    if (steps.length === 0) return res.json({ steps: [] })

    const prompt = `You are given a recipe's ingredient list and preparation steps.

Ingredients:
${ingredients.map((ing, i) => `${i + 1}. ${ing}`).join('\n')}

Steps:
${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Task: For every ingredient name that appears in the steps, make sure the amount immediately before it exactly matches the ingredient list above.
- If the amount is already correct: leave it as is.
- If the amount is wrong (e.g. outdated value): replace it with the correct amount from the ingredient list.
- If no amount is present before the ingredient name: insert the correct amount from the ingredient list.
- Do not change any other wording, language, sentence structure, or punctuation.
- Preserve the original language exactly (German stays German, English stays English).

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
