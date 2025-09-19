/**
 * Shared analytics calculations utility
 * Used by both checkIns.js and insights.js routes
 */

function calculateAnalytics(checkIns, teamMembers, period) {
  if (!checkIns || checkIns.length === 0) {
    return {
      team_id: null,
      period,
      sentiment_trend: [],
      mood_distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      energy_distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      sentiment_distribution: { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 },
      participation_rate: 0,
      total_checkins: 0,
      average_mood: 0,
      average_energy: 0,
      average_sentiment: 0,
      unique_participants: 0
    };
  }

  // Calculate distributions
  const moodDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const energyDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const sentimentDistribution = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 };

  let totalMood = 0;
  let totalEnergy = 0;
  let totalSentiment = 0;
  const uniqueUsers = new Set();

  checkIns.forEach(checkIn => {
    // Mood distribution
    moodDistribution[checkIn.mood_score]++;
    totalMood += checkIn.mood_score;

    // Energy distribution
    energyDistribution[checkIn.energy_level]++;
    totalEnergy += checkIn.energy_level;

    // Sentiment distribution
    if (checkIn.sentiment_label) {
      sentimentDistribution[checkIn.sentiment_label]++;
    }
    if (checkIn.sentiment_score !== null) {
      totalSentiment += checkIn.sentiment_score;
    }

    // Track unique users for participation rate
    if (!checkIn.is_anonymous && checkIn.user_id) {
      uniqueUsers.add(checkIn.user_id);
    }
  });

  // Calculate averages
  const totalCheckIns = checkIns.length;
  const averageMood = totalMood / totalCheckIns;
  const averageEnergy = totalEnergy / totalCheckIns;
  const averageSentiment = totalSentiment / totalCheckIns;

  // Calculate participation rate
  const participationRate = teamMembers.length > 0 ? (uniqueUsers.size / teamMembers.length) : 0;

  // Calculate trend data (group by day)
  const trendData = {};
  checkIns.forEach(checkIn => {
    const date = checkIn.created_at.split('T')[0]; // Get date part only

    if (!trendData[date]) {
      trendData[date] = {
        date,
        mood_scores: [],
        energy_scores: [],
        sentiment_scores: [],
        count: 0
      };
    }

    trendData[date].mood_scores.push(checkIn.mood_score);
    trendData[date].energy_scores.push(checkIn.energy_level);
    if (checkIn.sentiment_score !== null) {
      trendData[date].sentiment_scores.push(checkIn.sentiment_score);
    }
    trendData[date].count++;
  });

  // Calculate daily averages
  const sentimentTrend = Object.values(trendData).map(day => ({
    date: day.date,
    avg_mood: Math.round((day.mood_scores.reduce((a, b) => a + b, 0) / day.mood_scores.length) * 100) / 100,
    avg_energy: Math.round((day.energy_scores.reduce((a, b) => a + b, 0) / day.energy_scores.length) * 100) / 100,
    avg_sentiment: day.sentiment_scores.length > 0
      ? Math.round((day.sentiment_scores.reduce((a, b) => a + b, 0) / day.sentiment_scores.length) * 100) / 100
      : 0,
    count: day.count
  })).sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    team_id: checkIns[0]?.team_id || null,
    period,
    sentiment_trend: sentimentTrend,
    mood_distribution: moodDistribution,
    energy_distribution: energyDistribution,
    sentiment_distribution: sentimentDistribution,
    participation_rate: Math.round(participationRate * 100) / 100,
    total_checkins: totalCheckIns,
    average_mood: Math.round(averageMood * 100) / 100,
    average_energy: Math.round(averageEnergy * 100) / 100,
    average_sentiment: Math.round(averageSentiment * 100) / 100,
    unique_participants: uniqueUsers.size,
    insights_count: 0 // Will be populated when insights feature is implemented
  };
}

module.exports = {
  calculateAnalytics
};