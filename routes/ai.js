const express = require('express');
const { analyzeSentiment, testConnection } = require('../config/huggingface');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();

// Test sentiment analysis
router.post('/sentiment', authenticateUser, async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (text.length > 1000) {
      return res.status(400).json({ error: 'Text too long (max 1000 characters)' });
    }

    const result = await analyzeSentiment(text);
    
    res.json({
      text,
      sentiment: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sentiment analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze sentiment' });
  }
});

// Test HuggingFace connection
router.get('/test', authenticateUser, async (req, res) => { 
    try { const isConnected = await testConnection(); 
        res.json({ huggingface: { connected: isConnected, status: isConnected ? 'ready' : 'unavailable' 

        }, 
        timestamp: new Date().toISOString() 
    });
    } catch (error) { 
    console.error('HuggingFace test error:', error); 
    res.status(500).json({ error: 'Failed to test HuggingFace connection' }); 
    }
});

// Batch sentiment analysis (for processing multiple check-ins)
router.post('/sentiment/batch', authenticateUser, async (req, res) => {
  try {
    const { texts } = req.body;
    
    if (!Array.isArray(texts)) {
      return res.status(400).json({ error: 'Texts must be an array' });
    }

    if (texts.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 texts per batch' });
    }

    const results = [];
    
    for (const text of texts) {
      if (typeof text === 'string' && text.length <= 1000) {
        const sentiment = await analyzeSentiment(text);
        results.push({ text, sentiment });
      } else {
        results.push({ 
          text, 
          sentiment: null, 
          error: 'Invalid text or too long' 
        });
      }
    }
    
    res.json({
      results,
      processed: results.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Batch sentiment analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze sentiments' });
  }
});

module.exports = router;