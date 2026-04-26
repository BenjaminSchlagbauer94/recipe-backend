require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { errorHandler, notFound } = require('./middleware/errorHandler')

// ── Validate required env vars on startup ────────────────
const required = ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']
const missing = required.filter(k => !process.env[k])
if (missing.length) {
  console.error('❌ Missing environment variables:', missing.join(', '))
  process.exit(1)
}

const app = express()
const PORT = process.env.PORT || 4000

// ── Middleware ───────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,        // your Netlify URL
    'http://localhost:3000',          // local React dev
    'http://localhost:3001',
  ].filter(Boolean),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))

// ── Request logger (simple, no library needed) ───────────
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const ms = Date.now() - start
    console.log(`${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`)
  })
  next()
})

// ── Health check — Render pings this to wake the server ──
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  })
})

// ── Routes ───────────────────────────────────────────────
app.use('/scrape',               require('./routes/scrape'))
app.use('/recipes',              require('./routes/recipes'))
app.use('/categories',           require('./routes/categories'))
app.use('/shopping',             require('./routes/shopping'))
app.use('/inspirations',         require('./routes/inspirations'))
app.use('/grocery-suggestions',  require('./routes/grocerySuggestions'))
app.use('/enhance-steps',        require('./routes/enhanceSteps'))

// ── 404 + Error handlers ─────────────────────────────────
app.use(notFound)
app.use(errorHandler)

// ── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Recipe API running on port ${PORT}`)
  console.log(`   Health check: http://localhost:${PORT}/health`)
})
