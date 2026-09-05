const express = require('express')
const router = express.Router()
const supabase = require('../lib/supabase')

const CALENDAR_ID = 'main'
const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10)
}

function getMondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

// Count how many active-day slots exist from anchorDate (inclusive) to targetDate (exclusive)
function countActiveSlotsBeforeDate(anchorDateStr, targetDateStr, activeDays) {
  let count = 0
  const current = new Date(anchorDateStr + 'T00:00:00')
  const target = new Date(targetDateStr + 'T00:00:00')
  while (current < target) {
    if (activeDays.includes(DAY_NAMES[current.getDay()])) count++
    current.setDate(current.getDate() + 1)
  }
  return count
}

function getNextActiveDay(activeDays) {
  const today = new Date()
  for (let i = 0; i < 7; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    if (activeDays.includes(DAY_NAMES[d.getDay()])) return toDateStr(d)
  }
  return toDateStr(today)
}

async function getCalendarRow() {
  const { data, error } = await supabase
    .from('cooking_calendar')
    .select('*')
    .eq('id', CALENDAR_ID)
    .maybeSingle()
  if (error) throw error
  return data || {
    id: CALENDAR_ID,
    active_days: [],
    highlighted_recipe_ids: [],
    carousel_order: [],
    carousel_anchor_date: null,
    day_overrides: {}
  }
}

async function getRecipesByIds(ids) {
  if (!ids || ids.length === 0) return []
  const { data, error } = await supabase
    .from('recipes')
    .select('id, name, image_url, servings')
    .in('id', ids)
  if (error) throw error
  return data || []
}

async function doReshuffle(activeDays, highlightedIds) {
  const carouselOrder = shuffle(highlightedIds)
  const anchorDate = activeDays.length > 0
    ? getNextActiveDay(activeDays)
    : toDateStr(new Date())
  const { error } = await supabase
    .from('cooking_calendar')
    .upsert({
      id: CALENDAR_ID,
      active_days: activeDays,
      highlighted_recipe_ids: highlightedIds,
      carousel_order: carouselOrder,
      carousel_anchor_date: anchorDate,
      day_overrides: {}
    })
  if (error) throw error
}

// GET /calendar
router.get('/', async (req, res, next) => {
  try {
    const row = await getCalendarRow()
    const highlightedRecipes = await getRecipesByIds(row.highlighted_recipe_ids || [])
    res.json({ ...row, highlighted_recipes: highlightedRecipes })
  } catch (err) { next(err) }
})

// PUT /calendar/settings — update active_days and/or highlighted_recipe_ids
// If either changes, triggers a full reshuffle
router.put('/settings', async (req, res, next) => {
  try {
    const row = await getCalendarRow()
    const newActiveDays = req.body.active_days ?? row.active_days
    const newHighlightedIds = req.body.highlighted_recipe_ids ?? row.highlighted_recipe_ids

    const daysChanged = [...newActiveDays].sort().join(',') !== [...(row.active_days || [])].sort().join(',')
    const poolChanged = [...newHighlightedIds].sort().join(',') !== [...(row.highlighted_recipe_ids || [])].sort().join(',')

    if (daysChanged || poolChanged) {
      await doReshuffle(newActiveDays, newHighlightedIds)
    } else {
      await supabase.from('cooking_calendar').upsert({
        id: CALENDAR_ID,
        active_days: newActiveDays,
        highlighted_recipe_ids: newHighlightedIds
      })
    }

    const updated = await getCalendarRow()
    const highlightedRecipes = await getRecipesByIds(updated.highlighted_recipe_ids || [])
    res.json({ ...updated, highlighted_recipes: highlightedRecipes })
  } catch (err) { next(err) }
})

// POST /calendar/reshuffle — shuffle carousel order, reset anchor date, clear overrides
router.post('/reshuffle', async (req, res, next) => {
  try {
    const row = await getCalendarRow()
    await doReshuffle(row.active_days || [], row.highlighted_recipe_ids || [])
    const updated = await getCalendarRow()
    const highlightedRecipes = await getRecipesByIds(updated.highlighted_recipe_ids || [])
    res.json({ ...updated, highlighted_recipes: highlightedRecipes })
  } catch (err) { next(err) }
})

// PUT /calendar/override — set or remove a one-off recipe for a specific date
// Body: { date: "2026-09-08", recipeId: "uuid" | null }
router.put('/override', async (req, res, next) => {
  try {
    const { date, recipeId } = req.body
    if (!date) return res.status(400).json({ error: 'date is required' })
    const row = await getCalendarRow()
    const overrides = { ...(row.day_overrides || {}) }
    if (recipeId) {
      overrides[date] = recipeId
    } else {
      delete overrides[date]
    }
    await supabase.from('cooking_calendar').upsert({ id: CALENDAR_ID, day_overrides: overrides })
    res.json({ day_overrides: overrides })
  } catch (err) { next(err) }
})

// GET /calendar/week?date=2026-09-08 — resolve recipe assignments for the week containing date
router.get('/week', async (req, res, next) => {
  try {
    const { date } = req.query
    if (!date) return res.status(400).json({ error: 'date query param required' })

    const row = await getCalendarRow()
    const { active_days, carousel_order, carousel_anchor_date, day_overrides } = row

    if (!carousel_anchor_date || !carousel_order || carousel_order.length === 0 || !active_days || active_days.length === 0) {
      return res.json({ days: [] })
    }

    const monday = getMondayOf(date)
    const dayEntries = []

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const dateStr = toDateStr(d)
      const dayName = DAY_NAMES[d.getDay()]

      if (!active_days.includes(dayName)) continue

      const overrideId = (day_overrides || {})[dateStr]
      let recipeId
      if (overrideId) {
        recipeId = overrideId
      } else {
        const slotIdx = countActiveSlotsBeforeDate(carousel_anchor_date, dateStr, active_days)
        recipeId = carousel_order[slotIdx % carousel_order.length]
      }
      dayEntries.push({ date: dateStr, dayName, recipeId, isOverride: !!overrideId })
    }

    const uniqueIds = [...new Set(dayEntries.map(e => e.recipeId))]
    const recipes = await getRecipesByIds(uniqueIds)
    const recipeMap = Object.fromEntries(recipes.map(r => [r.id, r]))

    res.json({
      days: dayEntries.map(e => ({
        date: e.date,
        dayName: e.dayName,
        recipe: recipeMap[e.recipeId] || null,
        isOverride: e.isOverride
      }))
    })
  } catch (err) { next(err) }
})

module.exports = router
