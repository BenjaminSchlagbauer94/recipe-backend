const express = require('express')
const router = express.Router()
const supabase = require('../lib/supabase')

// GET /categories — fetch all categories
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) throw error
    res.json(data)
  } catch (err) {
    console.error('GET /categories error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /categories — create a new category
router.post('/', async (req, res) => {
  try {
    const { name } = req.body
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name is required' })
    }

    const { data, error } = await supabase
      .from('categories')
      .insert([{ name: name.trim() }])
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    console.error('POST /categories error:', err)
    res.status(500).json({ error: err.message })
  }
})

// DELETE /categories/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('DELETE /categories error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
