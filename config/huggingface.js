const { HfInference } = require('@huggingface/inference');

let hf = null;

const initializeHuggingFace = () => {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  
  if (!apiKey) {
    console.warn('⚠️  HUGGINGFACE_API_KEY not provided, AI features will be disabled');
    return null;
  }

  try {
    hf = new HfInference(apiKey);
    console.log('✅ HuggingFace API initialized');
    return hf;
  } catch (error) {
    console.error('❌ Failed to initialize HuggingFace:', error.message);
    return null;
  }
};

// Sentiment analysis function
const analyzeSentiment = async (text) => {
  if (!hf) {
    console.warn('HuggingFace not initialized, skipping sentiment analysis');
    return {
      label: 'neutral',
      score: 0.5,
      normalizedScore: 0
    };
  }

  try {
    // Use RoBERTa model for sentiment analysis
    const result = await hf.textClassification({
      model: 'cardiffnlp/twitter-roberta-base-sentiment-latest',
      inputs: text
    });

    if (!result || result.length === 0) {
      throw new Error('No sentiment analysis result');
    }

    const sentiment = result[0];
    
    // Convert to our format
    let normalizedScore = 0;
    let label = 'neutral';

    switch (sentiment.label) {
      case 'LABEL_0': // Negative
      case 'NEGATIVE':
        label = 'negative';
        normalizedScore = -sentiment.score;
        break;
      case 'LABEL_1': // Neutral
      case 'NEUTRAL':
        label = 'neutral';
        normalizedScore = (sentiment.score - 0.5) * 2;
        break;
      case 'LABEL_2': // Positive  
      case 'POSITIVE':
        label = 'positive';
        normalizedScore = sentiment.score;
        break;
      default:
        label = 'neutral';
        normalizedScore = 0;
    }

    console.log(`📊 Sentiment analysis: "${text}" -> ${label} (${normalizedScore.toFixed(2)})`);

    return {
      label,
      score: sentiment.score,
      normalizedScore: Math.max(-1, Math.min(1, normalizedScore)) // Clamp between -1 and 1
    };

  } catch (error) {
    console.error('❌ Sentiment analysis error:', error.message);
    
    // Fallback to simple keyword-based analysis
    return fallbackSentimentAnalysis(text);
  }
};

// Simple fallback sentiment analysis
const fallbackSentimentAnalysis = (text) => {
  const positiveWords = ['good', 'great', 'excellent', 'amazing', 'happy', 'love', 'awesome', 'fantastic', 'wonderful', 'perfect'];
  const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'sad', 'angry', 'frustrated', 'difficult', 'problem', 'issue'];
  
  const words = text.toLowerCase().split(/\s+/);
  let positiveCount = 0;
  let negativeCount = 0;
  
  words.forEach(word => {
    if (positiveWords.includes(word)) positiveCount++;
    if (negativeWords.includes(word)) negativeCount++;
  });
  
  let label = 'neutral';
  let normalizedScore = 0;
  
  if (positiveCount > negativeCount) {
    label = 'positive';
    normalizedScore = Math.min(0.8, (positiveCount - negativeCount) / words.length * 5);
  } else if (negativeCount > positiveCount) {
    label = 'negative';
    normalizedScore = Math.max(-0.8, -(negativeCount - positiveCount) / words.length * 5);
  }
  
  console.log(`📊 Fallback sentiment: "${text}" -> ${label} (${normalizedScore.toFixed(2)})`);
  
  return {
    label,
    score: Math.abs(normalizedScore),
    normalizedScore
  };
};

// Text generation for insights
const generateInsight = async (prompt, maxTokens = 200) => {
  if (!hf) {
    console.warn('HuggingFace not initialized, returning default insight');
    return 'Team sentiment analysis is currently unavailable. Please check your configuration.';
  }

  try {
    const result = await hf.textGeneration({
      model: 'microsoft/DialoGPT-medium',
      inputs: prompt,
      parameters: {
        max_new_tokens: maxTokens,
        temperature: 0.7,
        do_sample: true,
        return_full_text: false
      }
    });

    return result.generated_text?.trim() || 'Unable to generate insight at this time.';

  } catch (error) {
    console.error('❌ Text generation error:', error.message);
    return 'Unable to generate insight at this time due to API limitations.';
  }
};

// Test HuggingFace connection
const testConnection = async () => {
  if (!hf) return false;

  try {
    console.log('🧪 Testing HuggingFace connection...');
    const result = await analyzeSentiment('This is a test message to check if the API is working');
    console.log('✅ HuggingFace connection test successful:', result);
    return true;
  } catch (error) {
    console.error('❌ HuggingFace connection test failed:', error.message);
    return false;
  }
};

module.exports = {
  hf: initializeHuggingFace(),
  analyzeSentiment,
  generateInsight,
  testConnection,
  fallbackSentimentAnalysis
};