const axios = require('axios');

class InsightsService {
  constructor() {
    this.huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY;
    this.textGenerationUrl = 'https://api-inference.huggingface.co/models/microsoft/DialoGPT-large'; 
    this.maxRetries = 3; 
    this.retryDelay = 1000;
  }

  /**
   * Generate AI-powered insights for team wellness data
   * @param {Object} teamData - Team analytics data
   * @param {string} insightType - Type of insight (daily, weekly, monthly, alert)
   * @returns {Promise<Object>} Generated insight
   */
async generateTeamInsight(teamData, insightType = 'weekly') { 
    try { 
        const prompt = this.buildInsightPrompt(teamData, insightType);

        // Try HuggingFace first, fallback to rule-based insights
        let insight;
        try {
            insight = await this.generateWithHuggingFace(prompt);
        } catch (error) {
            console.warn('HuggingFace insight generation failed, using fallback:', error.message);
            insight = this.generateFallbackInsight(teamData, insightType);
        }
        return {
        type: insightType,
        title: this.generateInsightTitle(teamData, insightType),
        content: insight,
        severity: this.calculateSeverity(teamData),
        metadata: {
          generated_at: new Date().toISOString(),
          team_size: teamData.unique_participants,
          participation_rate: teamData.participation_rate,
          avg_sentiment: teamData.average_sentiment,
          avg_mood: teamData.average_mood,
          fallback_used: !this.huggingFaceApiKey
        }
      };
    } catch (error) {
      console.error('Insight generation error:', error);
      throw new Error('Failed to generate team insight');
    }
  }

    /**
   * Build a structured prompt for AI insight generation
   * @param {Object} teamData - Team analytics data
   * @param {string} insightType - Type of insight
   * @returns {string} Formatted prompt
   */
  buildInsightPrompt(teamData, insightType) {
    const timeframe = insightType === 'daily' ? 'today' :
                     insightType === 'weekly' ? 'this week' :
                     insightType === 'monthly' ? 'this month' : 'recently';

    return `
Team Wellness Analysis for ${timeframe}:

Key Metrics:
- Total Check-ins: ${teamData.total_checkins}
- Team Participation: ${Math.round(teamData.participation_rate * 100)}% (${teamData.unique_participants} members)
- Average Mood: ${teamData.average_mood}/5 (${this.getMoodDescription(teamData.average_mood)})
- Average Energy: ${teamData.average_energy}/5 (${this.getEnergyDescription(teamData.average_energy)})
- Sentiment Score: ${teamData.average_sentiment} (${this.getSentimentDescription(teamData.average_sentiment)})

Sentiment Distribution:
- Positive: ${teamData.sentiment_distribution?.POSITIVE || 0} check-ins
- Neutral: ${teamData.sentiment_distribution?.NEUTRAL || 0} check-ins
- Negative: ${teamData.sentiment_distribution?.NEGATIVE || 0} check-ins

Based on this data, provide a brief professional insight (2-3 sentences) about the team's wellness and actionable recommendations for managers.
    `.trim();
  }
  /**
   * Generate insight using HuggingFace text generation
   * @param {string} prompt - Input prompt
   * @returns {Promise<string>} Generated insight
   */
  async generateWithHuggingFace(prompt) {
    if (!this.huggingFaceApiKey) {
      throw new Error('HuggingFace API key not configured');
    }

    const response = await axios.post(
      this.textGenerationUrl,
      {
        inputs: prompt,
        parameters: {
          max_length: 200,
          temperature: 0.7,
          do_sample: true,
          top_p: 0.9
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${this.huggingFaceApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (response.data && response.data[0]?.generated_text) {
      return this.cleanGeneratedText(response.data[0].generated_text, prompt);
    }

    throw new Error('No generated text received from HuggingFace');
  }

  /**
   * Clean and format AI-generated text
   * @param {string} generatedText - Raw generated text
   * @param {string} originalPrompt - Original prompt
   * @returns {string} Cleaned insight
   */
  cleanGeneratedText(generatedText, originalPrompt) {
    // Remove the original prompt from the response
    let cleaned = generatedText.replace(originalPrompt, '').trim();

    // Clean up common AI artifacts
    cleaned = cleaned
      .replace(/^[^\w]*/, '') // Remove leading non-word characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Ensure it ends with proper punctuation
    if (cleaned && !cleaned.match(/[.!?]$/)) {
      cleaned += '.';
    }

    return cleaned || this.generateFallbackInsight({}, 'weekly');
  }

  /**
   * Generate rule-based insights when AI is unavailable
   * @param {Object} teamData - Team analytics data
   * @param {string} insightType - Type of insight
   * @returns {string} Generated insight
   */
  generateFallbackInsight(teamData, insightType) {
    const insights = [];

    // Participation insights
    if (teamData.participation_rate < 0.5) {
      insights.push("Team engagement is low with less than 50% participation in check-ins. Consider encouraging more frequent updates or addressing potential barriers to participation.");
    } else if (teamData.participation_rate > 0.8) {
      insights.push("Excellent team engagement with high participation rates in wellness check-ins.");
    }

    // Mood insights
    if (teamData.average_mood < 2.5) {
      insights.push("Team mood is concerning and requires immediate attention. Consider one-on-one meetings and workload assessment.");
    } else if (teamData.average_mood > 4.0) {
      insights.push("Team morale is high, indicating positive team dynamics and work satisfaction.");
    } else if (teamData.average_mood < 3.5) {
      insights.push("Team mood is below average. Monitor closely and consider team building activities or workload adjustments.");
    }

    // Sentiment insights
    if (teamData.average_sentiment < -0.3) {
      insights.push("Negative sentiment patterns detected. Immediate intervention recommended to address team concerns.");
    } else if (teamData.average_sentiment > 0.3) {
      insights.push("Positive sentiment trends show the team is performing well and feeling satisfied.");
    }

    // Energy insights
    if (teamData.average_energy < 2.5) {
      insights.push("Low energy levels across the team may indicate burnout risk or excessive workload.");
    } else if (teamData.average_energy > 4.0) {
      insights.push("High energy levels suggest good work-life balance and team motivation.");
    }

    // Default insight if no specific patterns
    if (insights.length === 0) {
      insights.push(`Team wellness metrics are within normal ranges. Continue monitoring ${insightType} patterns for early detection of any changes.`);
    }

    return insights.join(' ');
  }
  /**
   * Generate appropriate title for insight
   * @param {Object} teamData - Team analytics data
   * @param {string} insightType - Type of insight
   * @returns {string} Insight title
   */
  generateInsightTitle(teamData, insightType) {
    const timeframe = insightType.charAt(0).toUpperCase() + insightType.slice(1);

    if (teamData.average_mood < 2.5 || teamData.average_sentiment < -0.3) {
      return `${timeframe} Alert: Team Wellness Requires Attention`;
    } else if (teamData.average_mood > 4.0 && teamData.average_sentiment > 0.3) {
      return `${timeframe} Update: Team Performance Excellent`;
    } else if (teamData.participation_rate < 0.5) {
      return `${timeframe} Notice: Low Team Engagement`;
    } else {
      return `${timeframe} Team Wellness Summary`;
    }
  }

  /**
   * Calculate insight severity based on team metrics
   * @param {Object} teamData - Team analytics data
   * @returns {string} Severity level
   */
  calculateSeverity(teamData) {
    const criticalConditions = [
      teamData.average_mood < 2.0,
      teamData.average_sentiment < -0.5,
      teamData.average_energy < 2.0,
      teamData.participation_rate < 0.3
    ];

    const warningConditions = [
      teamData.average_mood < 3.0,
      teamData.average_sentiment < -0.2,
      teamData.average_energy < 3.0,
      teamData.participation_rate < 0.6
    ];

    if (criticalConditions.some(condition => condition)) {
      return 'critical';
    } else if (warningConditions.some(condition => condition)) {
      return 'warning';
    } else {
      return 'info';
    }
  }
  /**
   * Get descriptive text for mood score
   * @param {number} mood - Mood score (1-5)
   * @returns {string} Description
   */
  getMoodDescription(mood) {
    if (mood >= 4.5) return 'Excellent';
    if (mood >= 3.5) return 'Good';
    if (mood >= 2.5) return 'Fair';
    if (mood >= 1.5) return 'Poor';
    return 'Very Poor';
  }

  /**
   * Get descriptive text for energy score
   * @param {number} energy - Energy score (1-5)
   * @returns {string} Description
   */
  getEnergyDescription(energy) {
    if (energy >= 4.5) return 'Very High';
    if (energy >= 3.5) return 'High';
    if (energy >= 2.5) return 'Moderate';
    if (energy >= 1.5) return 'Low';
    return 'Very Low';
  }

  /**
   * Get descriptive text for sentiment score
   * @param {number} sentiment - Sentiment score (-1 to 1)
   * @returns {string} Description
   */
  getSentimentDescription(sentiment) {
    if (sentiment >= 0.5) return 'Very Positive';
    if (sentiment >= 0.2) return 'Positive';
    if (sentiment >= -0.2) return 'Neutral';
    if (sentiment >= -0.5) return 'Negative';
    return 'Very Negative';
  }

  /**
   * Generate multiple insights for different time periods
   * @param {Object} teamData - Team analytics data
   * @returns {Promise<Array>} Array of insights
   */
  async generateMultipleInsights(teamData) {
    const insights = await Promise.all([
      this.generateTeamInsight(teamData, 'daily'),
      this.generateTeamInsight(teamData, 'weekly'),
      this.generateTeamInsight(teamData, 'monthly')
    ]);

    return insights;
  }
}

module.exports = new InsightsService();


