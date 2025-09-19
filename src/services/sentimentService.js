const axios = require('axios');

class SentimentService {
  constructor() {
    this.apiUrl = 'https://api-inference.huggingface.co/models/cardiffnlp/twitter-roberta-base-sentiment-latest';
    this.apiKey = process.env.HUGGINGFACE_API_KEY;
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
  }

  /**
   * Analyze sentiment of text using HuggingFace API
   * @param {string} text - Text to analyze
   * @returns {Promise<Object>} Sentiment analysis result
   */
  async analyzeSentiment(text) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Text is required for sentiment analysis');
    }

    if (!this.apiKey) {
      console.warn('HuggingFace API key not found, using fallback sentiment analysis');
      return this.fallbackSentimentAnalysis(text);
    }

    // Clean and preprocess text
    const cleanText = this.preprocessText(text);

    try {
      const result = await this.callHuggingFaceAPI(cleanText);
      return this.normalizeSentimentResult(result);
    } catch (error) {
      console.error('HuggingFace API error, falling back to local analysis:', error.message);
      return this.fallbackSentimentAnalysis(cleanText);
    }
  }

  /**
   * Call HuggingFace API with retry logic
   * @param {string} text - Preprocessed text
   * @returns {Promise<Array>} API response
   */
  async callHuggingFaceAPI(text) {
    let lastError;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await axios.post(
          this.apiUrl,
          { inputs: text },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000, // 10 seconds
          }
        );

        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          return response.data[0]; // First result contains sentiment scores
        }

        throw new Error('Invalid response format from HuggingFace API');
      } catch (error) {
        lastError = error;

        if (error.response?.status === 503 && attempt < this.maxRetries) {
          // Model is loading, wait and retry
          console.log(`HuggingFace model loading, retry ${attempt}/${this.maxRetries} in ${this.retryDelay}ms`);
          await this.sleep(this.retryDelay * attempt);
          continue;
        }

        if (attempt === this.maxRetries) {
          throw error;
        }

        // Wait before retry for other errors
        await this.sleep(this.retryDelay);
      }
    }

    throw lastError;
  }

  /**
   * Preprocess text for better sentiment analysis
   * @param {string} text - Raw text
   * @returns {string} Cleaned text
   */
  preprocessText(text) {
    return text
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s.,!?-]/g, '') // Remove special characters except basic punctuation
      .substring(0, 500); // Limit length for API
  }

  /**
   * Normalize HuggingFace API result to our format
   * @param {Array} apiResult - HuggingFace API response
   * @returns {Object} Normalized sentiment result
   */
  normalizeSentimentResult(apiResult) {
    if (!apiResult || !Array.isArray(apiResult)) {
      throw new Error('Invalid API result format');
    }

    // Find the highest confidence prediction
    const topPrediction = apiResult.reduce((prev, current) =>
      (prev.score > current.score) ? prev : current
    );

    // Map HuggingFace labels to our format
    const labelMap = {
      'LABEL_0': 'NEGATIVE',
      'LABEL_1': 'NEUTRAL',
      'LABEL_2': 'POSITIVE',
      'NEGATIVE': 'NEGATIVE',
      'NEUTRAL': 'NEUTRAL',
      'POSITIVE': 'POSITIVE'
    };

    const normalizedLabel = labelMap[topPrediction.label] || 'NEUTRAL';

    // Convert to -1 to 1 scale for database storage
    let normalizedScore;
    switch (normalizedLabel) {
      case 'POSITIVE':
        normalizedScore = topPrediction.score;
        break;
      case 'NEGATIVE':
        normalizedScore = -topPrediction.score;
        break;
      default: // NEUTRAL
        normalizedScore = 0;
    }

    return {
      label: normalizedLabel,
      score: topPrediction.score,
      normalizedScore: Math.round(normalizedScore * 100) / 100, // Round to 2 decimal places
      confidence: topPrediction.score,
      allScores: apiResult
    };
  }

  /**
   * Fallback sentiment analysis using simple keyword matching
   * @param {string} text - Text to analyze
   * @returns {Object} Sentiment result
   */
  fallbackSentimentAnalysis(text) {
    const positiveWords = [
      'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'awesome',
      'happy', 'excited', 'love', 'perfect', 'brilliant', 'outstanding', 'superb',
      'pleased', 'satisfied', 'delighted', 'thrilled', 'successful', 'productive'
    ];

    const negativeWords = [
      'bad', 'terrible', 'awful', 'horrible', 'hate', 'angry', 'frustrated',
      'disappointed', 'sad', 'depressed', 'stressed', 'overwhelmed', 'exhausted',
      'annoyed', 'upset', 'worried', 'concerned', 'burnout', 'tired', 'difficult'
    ];

    const words = text.toLowerCase().split(/\s+/);
    let positiveCount = 0;
    let negativeCount = 0;

    words.forEach(word => {
      if (positiveWords.includes(word)) positiveCount++;
      if (negativeWords.includes(word)) negativeCount++;
    });

    const totalWords = words.length;
    const positiveRatio = positiveCount / totalWords;
    const negativeRatio = negativeCount / totalWords;

    let label, normalizedScore, confidence;

    if (positiveRatio > negativeRatio && positiveCount > 0) {
      label = 'POSITIVE';
      normalizedScore = Math.min(positiveRatio * 2, 1); // Scale up but cap at 1
      confidence = 0.6 + (positiveRatio * 0.4); // 0.6-1.0 range
    } else if (negativeRatio > positiveRatio && negativeCount > 0) {
      label = 'NEGATIVE';
      normalizedScore = -Math.min(negativeRatio * 2, 1);
      confidence = 0.6 + (negativeRatio * 0.4);
    } else {
      label = 'NEUTRAL';
      normalizedScore = 0;
      confidence = 0.5;
    }

    return {
      label,
      score: confidence,
      normalizedScore: Math.round(normalizedScore * 100) / 100,
      confidence,
      fallback: true
    };
  }

  /**
   * Batch analyze multiple texts
   * @param {Array<string>} texts - Array of texts to analyze
   * @returns {Promise<Array>} Array of sentiment results
   */
  async batchAnalyzeSentiment(texts) {
    if (!Array.isArray(texts)) {
      throw new Error('Texts must be an array');
    }

    const results = [];

    // Process in batches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchPromises = batch.map(text => this.analyzeSentiment(text));

      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      } catch (error) {
        console.error(`Batch sentiment analysis failed for batch ${i}-${i + batchSize}:`, error);
        // Add fallback results for failed batch
        const fallbackResults = batch.map(text => this.fallbackSentimentAnalysis(text));
        results.push(...fallbackResults);
      }

      // Small delay between batches
      if (i + batchSize < texts.length) {
        await this.sleep(200);
      }
    }

    return results;
  }

  /**
   * Sleep utility function
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get sentiment statistics for an array of results
   * @param {Array} sentimentResults - Array of sentiment analysis results
   * @returns {Object} Statistics
   */
  getStatistics(sentimentResults) {
    if (!Array.isArray(sentimentResults) || sentimentResults.length === 0) {
      return {
        averageScore: 0,
        distribution: { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 },
        totalCount: 0
      };
    }

    const distribution = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 };
    let totalScore = 0;

    sentimentResults.forEach(result => {
      distribution[result.label]++;
      totalScore += result.normalizedScore;
    });

    return {
      averageScore: Math.round((totalScore / sentimentResults.length) * 100) / 100,
      distribution,
      totalCount: sentimentResults.length,
      positivePercentage: Math.round((distribution.POSITIVE / sentimentResults.length) * 100),
      negativePercentage: Math.round((distribution.NEGATIVE / sentimentResults.length) * 100),
      neutralPercentage: Math.round((distribution.NEUTRAL / sentimentResults.length) * 100)
    };
  }
}

module.exports = new SentimentService();