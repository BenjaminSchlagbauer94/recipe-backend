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
// Body: { items: [{ recipeId, servings }], otherItems: ["toilet paper", ...] }
router.post('/list', async (req, res, next) => {
  try {
    const { items = [], otherItems = [] } = req.body
    if (items.length === 0 && otherItems.length === 0) {
      return res.status(400).json({ error: 'items or otherItems is required' })
    }

    const allIngredients = []

    if (items.length > 0) {
      const recipeIds = items.map(i => i.recipeId)
      const { data: recipes, error } = await supabase
        .from('recipes')
        .select('id, name, servings, ingredients')
        .in('id', recipeIds)
      if (error) throw error

      for (const item of items) {
        const recipe = recipes.find(r => r.id === item.recipeId)
        if (!recipe) continue
        const scaled = scaleIngredients(recipe.ingredients || [], recipe.servings, item.servings)
        allIngredients.push(`--- ${recipe.name} (${item.servings} people) ---`)
        allIngredients.push(...scaled)
      }
    }

    if (otherItems.length > 0) {
      allIngredients.push('--- Other Items ---')
      allIngredients.push(...otherItems)
    }

    const prompt = `You are organising a shopping list for grocery shopping at an Irish Dunnes store.

Below are ingredients from recipes (already scaled) and any manually added items.

Tasks:
1. Merge identical or very similar ingredients (add their amounts where units match)
2. Place each item into the correct store category
3. Sort categories in the order a shopper walks through Dunnes

Categories IN THIS EXACT ORDER (skip a category if it has no items):
- Fruits & Vegetables
- Meat & Fish
- Dairy & Refrigerated
- Bread & Bakery
- Canned & Preserved
- Pasta, Rice & Grains
- Pantry & Other
- Household & Personal Care

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
- "name" = clean item name only, no amounts, capitalise first letter
- "amount" = quantity + unit as a string ("300g", "2 cloves", "1 L", "to taste", "1 pack"); use empty string "" if no quantity applies
- Keep the original language of the ingredients (German stays German)
- Non-food household/personal care items (toilet paper, shower gel, etc.) go in "Household & Personal Care"
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
