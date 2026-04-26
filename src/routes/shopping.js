const express = require('express')
const router = express.Router()
const supabase = require('../lib/supabase')
const anthropic = require('../lib/anthropic')

function scaleIngredients(ingredients, originalServings, targetServings) {
  if (!originalServings || originalServings === targetServings) return ingredients
  const factor = targetServings / originalServings
  return ingredients.map(ing =>
    ing.replace(/\d+([.,]\d+)?/g, (n) => {
      const num = parseFloat(n.replace(',', '.'))
      const scaled = Math.round(num * factor * 10) / 10
      return scaled % 1 === 0 ? String(scaled) : String(scaled).replace('.', ',')
    })
  )
}

// POST /shopping/list
// Body: { items: [{ recipeId, servings }] }
router.post('/list', async (req, res, next) => {
  try {
    const { items } = req.body
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' })
    }

    const recipeIds = items.map(i => i.recipeId)
    const { data: recipes, error } = await supabase
      .from('recipes')
      .select('id, name, servings, ingredients')
      .in('id', recipeIds)

    if (error) throw error

    // Scale each recipe's ingredients and collect them all
    const allIngredients = []
    for (const item of items) {
      const recipe = recipes.find(r => r.id === item.recipeId)
      if (!recipe) continue
      const scaled = scaleIngredients(recipe.ingredients || [], recipe.servings, item.servings)
      allIngredients.push(`--- ${recipe.name} (${item.servings} people) ---`)
      allIngredients.push(...scaled)
    }

    const prompt = `You are organising a shopping list for grocery shopping at an Irish Dunnes store.

Below are ingredients from multiple recipes, already scaled to the correct serving amounts.

Tasks:
1. Merge identical or very similar ingredients (add their amounts where units match)
2. Place each ingredient into the correct grocery store category
3. Sort categories in the order a shopper walks through Dunnes

Categories IN THIS EXACT ORDER (skip a category if it has no items):
- Fruits & Vegetables
- Meat & Fish
- Dairy & Refrigerated
- Bread & Bakery
- Canned & Preserved
- Pasta, Rice & Grains
- Pantry & Other

Return ONLY this JSON (no markdown, no explanation):
{
  "categories": [
    {
      "name": "Fruits & Vegetables",
      "items": [
        { "name": "Apples", "amount": "300g" }
      ]
    }
  ]
}

Rules:
- "name" = clean ingredient name only, no amounts, capitalise first letter
- "amount" = quantity + unit as a string ("300g", "2 cloves", "1 L", "to taste")
- Keep the original language of the ingredients (German stays German)
- Ignore recipe header lines starting with ---

Ingredients:
${allIngredients.join('\n')}`

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

    const result = JSON.parse(jsonStr)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

module.exports = router
