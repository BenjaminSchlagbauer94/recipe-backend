const express = require('express')
const router = express.Router()
const supabase = require('../lib/supabase')

// GET /recipes — fetch all recipes (with category name joined)
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('recipes')
      .select(`
        *,
        categories (name)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Flatten category name onto each recipe
    const recipes = data.map(r => ({
      ...r,
      category_name: r.categories?.name || null,
      categories: undefined,
    }))

    res.json(recipes)
  } catch (err) {
    console.error('GET /recipes error:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /recipes/:id — fetch a single recipe
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('recipes')
      .select(`
        *,
        categories (name)
      `)
      .eq('id', req.params.id)
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Recipe not found' })

    res.json({
      ...data,
      category_name: data.categories?.name || null,
      categories: undefined,
    })
  } catch (err) {
    console.error('GET /recipes/:id error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /recipes — create a new recipe
router.post('/', async (req, res) => {
  try {
    const {
      name, category_id, servings,
      image_url, ingredients, steps,
      score_vitamins, score_proteins, score_carbs,
      source_url,
    } = req.body

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Recipe name is required' })
    }

    const { data, error } = await supabase
      .from('recipes')
      .insert([{
        name: name.trim(),
        category_id: category_id || null,
        servings: servings || 2,
        image_url: image_url || null,
        ingredients: ingredients || [],
        steps: steps || [],
        score_vitamins: score_vitamins || 5,
        score_proteins: score_proteins || 5,
        score_carbs: score_carbs || 5,
        source_url: source_url || null,
      }])
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    console.error('POST /recipes error:', err)
    res.status(500).json({ error: err.message })
  }
})

// PUT /recipes/:id — update a recipe
router.put('/:id', async (req, res) => {
  try {
    const {
      name, category_id, servings,
      image_url, ingredients, steps,
      score_vitamins, score_proteins, score_carbs,
    } = req.body

    const { data, error } = await supabase
      .from('recipes')
      .update({
        name: name?.trim(),
        category_id: category_id || null,
        servings,
        image_url: image_url || null,
        ingredients: ingredients || [],
        steps: steps || [],
        score_vitamins,
        score_proteins,
        score_carbs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    console.error('PUT /recipes/:id error:', err)
    res.status(500).json({ error: err.message })
  }
})

// DELETE /recipes/:id
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('recipes')
      .delete()
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('DELETE /recipes/:id error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
