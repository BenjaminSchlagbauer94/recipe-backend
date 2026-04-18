// Global error handler — catches anything routes throw
function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err)
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  })
}

// 404 handler for unknown routes
function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` })
}

module.exports = { errorHandler, notFound }
