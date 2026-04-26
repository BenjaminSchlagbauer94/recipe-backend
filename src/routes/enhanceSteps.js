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

Task: Update the steps so that every time an ingredient name appears in the text, its exact amount from the ingredient list is present immediately before the ingredient name. If the amount is already there correctly, leave it unchanged. Do not change any other wording, language, or structure. Preserve the original language exactly.

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
