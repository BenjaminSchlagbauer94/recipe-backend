const express = require('express')
const router = express.Router()
const supabase = require('../lib/supabase')

// GET /grocery-suggestions
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('grocery_suggestions')
      .select('id, name')
      .order('sort_order')
      .order('name')
    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

module.exports = router
