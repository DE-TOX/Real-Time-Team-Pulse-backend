const fs = require('fs');
const path = require('path');

class ExportService {
  constructor() {
    this.exportDir = path.join(process.cwd(), 'exports');
    this.ensureExportDirectory();
  }

  /**
   * Ensure export directory exists
   */
  ensureExportDirectory() {
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  /**
   * Export team analytics to CSV format
   * @param {Object} teamData - Team analytics data
   * @param {Array} checkIns - Check-ins data
   * @param {Object} options - Export options
   * @returns {Promise<string>} File path of exported CSV
   */
  async exportToCSV(teamData, checkIns, options = {}) {
    try {
      const {
        teamName = 'Team',
        period = '7d',
        includeIndividual = true,
        includeAnalytics = true
      } = options;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${teamName.replace(/[^a-zA-Z0-9]/g, '_')}_wellness_report_${timestamp}.csv`;
      const filepath = path.join(this.exportDir, filename);

      let csvContent = '';

      // Add header information
      csvContent += `Team Wellness Report\n`;
      csvContent += `Team: ${teamName}\n`;
      csvContent += `Period: ${period}\n`;
      csvContent += `Generated: ${new Date().toLocaleString()}\n`;
      csvContent += `\n`;

      // Add summary analytics if requested
      if (includeAnalytics && teamData) {
        csvContent += `TEAM ANALYTICS SUMMARY\n`;
        csvContent += `Total Check-ins,${teamData.total_checkins}\n`;
        csvContent += `Unique Participants,${teamData.unique_participants}\n`;
        csvContent += `Participation Rate,${Math.round(teamData.participation_rate * 100)}%\n`;
        csvContent += `Average Mood,${teamData.average_mood}/5\n`;
        csvContent += `Average Energy,${teamData.average_energy}/5\n`;
        csvContent += `Average Sentiment,${teamData.average_sentiment}\n`;
        csvContent += `\n`;

        // Add sentiment distribution
        csvContent += `SENTIMENT DISTRIBUTION\n`;
        csvContent += `Positive,${teamData.sentiment_distribution?.POSITIVE || 0}\n`;
        csvContent += `Neutral,${teamData.sentiment_distribution?.NEUTRAL || 0}\n`;
        csvContent += `Negative,${teamData.sentiment_distribution?.NEGATIVE || 0}\n`;
        csvContent += `\n`;

        // Add mood distribution
        csvContent += `MOOD DISTRIBUTION\n`;
        for (let i = 1; i <= 5; i++) {
          csvContent += `Mood ${i},${teamData.mood_distribution?.[i] || 0}\n`;
        }
        csvContent += `\n`;

        // Add daily trends if available
        if (teamData.sentiment_trend && teamData.sentiment_trend.length > 0) {
          csvContent += `DAILY TRENDS\n`;
          csvContent += `Date,Average Mood,Average Energy,Average Sentiment,Check-ins Count\n`;
          teamData.sentiment_trend.forEach(day => {
            csvContent += `${day.date},${day.avg_mood},${day.avg_energy},${day.avg_sentiment},${day.count}\n`;
          });
          csvContent += `\n`;
        }
      }

      // Add individual check-ins if requested
      if (includeIndividual && checkIns && checkIns.length > 0) {
        csvContent += `INDIVIDUAL CHECK-INS\n`;
        csvContent += `Date,User,Content,Mood Score,Energy Level,Sentiment Score,Sentiment Label,Anonymous,Input Method\n`;

        checkIns.forEach(checkIn => {
          const date = new Date(checkIn.created_at).toLocaleString();
          const user = checkIn.is_anonymous ? 'Anonymous' : (checkIn.profiles?.full_name || 'Unknown');
          const content = `"${checkIn.content.replace(/"/g, '""')}"`;  // Escape quotes
          const mood = checkIn.mood_score;
          const energy = checkIn.energy_level;
          const sentiment = checkIn.sentiment_score || 0;
          const sentimentLabel = checkIn.sentiment_label || 'Unknown';
          const anonymous = checkIn.is_anonymous ? 'Yes' : 'No';
          const inputMethod = checkIn.input_method || 'text';

          csvContent += `${date},${user},${content},${mood},${energy},${sentiment},${sentimentLabel},${anonymous},${inputMethod}\n`;
        });
      }

      // Write to file
      fs.writeFileSync(filepath, csvContent, 'utf8');

      return {
        filepath,
        filename,
        size: fs.statSync(filepath).size,
        recordCount: checkIns ? checkIns.length : 0
      };
    } catch (error) {
      console.error('CSV export error:', error);
      throw new Error('Failed to export CSV report');
    }
  }

  /**
   * Export team analytics to JSON format
   * @param {Object} teamData - Team analytics data
   * @param {Array} checkIns - Check-ins data
   * @param {Array} insights - AI insights data
   * @param {Object} options - Export options
   * @returns {Promise<string>} File path of exported JSON
   */
  async exportToJSON(teamData, checkIns, insights, options = {}) {
    try {
      const {
        teamName = 'Team',
        period = '7d',
        includeRawData = true
      } = options;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${teamName.replace(/[^a-zA-Z0-9]/g, '_')}_wellness_data_${timestamp}.json`;
      const filepath = path.join(this.exportDir, filename);

      const exportData = {
        metadata: {
          teamName,
          period,
          exportedAt: new Date().toISOString(),
          version: '1.0'
        },
        analytics: teamData,
        insights: insights || [],
        checkInsCount: checkIns ? checkIns.length : 0
      };

      // Include raw check-ins data if requested
      if (includeRawData && checkIns) {
        exportData.checkIns = checkIns.map(checkIn => ({
          ...checkIn,
          // Remove sensitive data if anonymous
          user_id: checkIn.is_anonymous ? null : checkIn.user_id,
          profiles: checkIn.is_anonymous ? null : checkIn.profiles
        }));
      }

      // Write to file
      fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2), 'utf8');

      return {
        filepath,
        filename,
        size: fs.statSync(filepath).size,
        recordCount: checkIns ? checkIns.length : 0
      };
    } catch (error) {
      console.error('JSON export error:', error);
      throw new Error('Failed to export JSON report');
    }
  }

  /**
   * Generate executive summary report
   * @param {Object} teamData - Team analytics data
   * @param {Array} insights - AI insights
   * @param {Object} alertStats - Alert statistics
   * @param {Object} options - Export options
   * @returns {Promise<string>} File path of summary report
   */
  async generateExecutiveSummary(teamData, insights, alertStats, options = {}) {
    try {
      const {
        teamName = 'Team',
        period = '7d',
        managerName = 'Team Manager'
      } = options;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${teamName.replace(/[^a-zA-Z0-9]/g, '_')}_executive_summary_${timestamp}.txt`;
      const filepath = path.join(this.exportDir, filename);

      let summary = '';

      // Header
      summary += `TEAM WELLNESS EXECUTIVE SUMMARY\n`;
      summary += `${'='.repeat(50)}\n\n`;
      summary += `Team: ${teamName}\n`;
      summary += `Manager: ${managerName}\n`;
      summary += `Period: ${period}\n`;
      summary += `Generated: ${new Date().toLocaleString()}\n\n`;

      // Key Metrics
      summary += `KEY METRICS\n`;
      summary += `${'-'.repeat(20)}\n`;
      summary += `• Team Participation: ${Math.round(teamData.participation_rate * 100)}% (${teamData.unique_participants} members)\n`;
      summary += `• Overall Mood: ${teamData.average_mood}/5 (${this.getMoodDescription(teamData.average_mood)})\n`;
      summary += `• Energy Level: ${teamData.average_energy}/5 (${this.getEnergyDescription(teamData.average_energy)})\n`;
      summary += `• Sentiment Score: ${teamData.average_sentiment} (${this.getSentimentDescription(teamData.average_sentiment)})\n`;
      summary += `• Total Check-ins: ${teamData.total_checkins}\n\n`;

      // Health Status
      summary += `TEAM HEALTH STATUS\n`;
      summary += `${'-'.repeat(20)}\n`;
      const healthStatus = this.assessTeamHealth(teamData);
      summary += `Overall Status: ${healthStatus.status}\n`;
      summary += `Risk Level: ${healthStatus.riskLevel}\n`;
      summary += `${healthStatus.description}\n\n`;

      // Alert Summary
      if (alertStats && alertStats.total > 0) {
        summary += `ALERTS SUMMARY\n`;
        summary += `${'-'.repeat(20)}\n`;
        summary += `• Total Alerts: ${alertStats.total}\n`;
        summary += `• Critical: ${alertStats.by_severity.critical}\n`;
        summary += `• Warnings: ${alertStats.by_severity.warning}\n`;
        summary += `• Info: ${alertStats.by_severity.info}\n`;
        summary += `• Acknowledged: ${alertStats.acknowledged}/${alertStats.total}\n\n`;
      }

      // Key Insights
      if (insights && insights.length > 0) {
        summary += `KEY INSIGHTS\n`;
        summary += `${'-'.repeat(20)}\n`;
        insights.slice(0, 3).forEach((insight, index) => {
          summary += `${index + 1}. ${insight.title}\n`;
          summary += `   ${insight.content}\n\n`;
        });
      }

      // Recommendations
      summary += `RECOMMENDATIONS\n`;
      summary += `${'-'.repeat(20)}\n`;
      const recommendations = this.generateRecommendations(teamData, alertStats);
      recommendations.forEach((rec, index) => {
        summary += `${index + 1}. ${rec}\n`;
      });
      summary += `\n`;

      // Trend Analysis
      if (teamData.sentiment_trend && teamData.sentiment_trend.length > 1) {
        summary += `TREND ANALYSIS\n`;
        summary += `${'-'.repeat(20)}\n`;
        const trendAnalysis = this.analyzeTrends(teamData.sentiment_trend);
        summary += `${trendAnalysis}\n\n`;
      }

      // Footer
      summary += `${'='.repeat(50)}\n`;
      summary += `This report was automatically generated by the Team Pulse Analytics System.\n`;
      summary += `For questions or concerns, please contact your HR representative.\n`;

      // Write to file
      fs.writeFileSync(filepath, summary, 'utf8');

      return {
        filepath,
        filename,
        size: fs.statSync(filepath).size
      };
    } catch (error) {
      console.error('Executive summary export error:', error);
      throw new Error('Failed to generate executive summary');
    }
  }

  /**
   * Clean up old export files
   * @param {number} maxAgeHours - Maximum age in hours (default 48)
   */
  cleanupOldExports(maxAgeHours = 48) {
    try {
      const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
      const files = fs.readdirSync(this.exportDir);

      let deletedCount = 0;
      files.forEach(file => {
        const filepath = path.join(this.exportDir, file);
        const stats = fs.statSync(filepath);

        if (stats.mtime.getTime() < cutoffTime) {
          fs.unlinkSync(filepath);
          deletedCount++;
        }
      });

      console.log(`Cleaned up ${deletedCount} old export files`);
      return deletedCount;
    } catch (error) {
      console.error('Export cleanup error:', error);
      return 0;
    }
  }

  /**
   * Get export file info
   * @param {string} filename - Export filename
   * @returns {Object} File information
   */
  getExportInfo(filename) {
    try {
      const filepath = path.join(this.exportDir, filename);
      if (!fs.existsSync(filepath)) {
        return null;
      }

      const stats = fs.statSync(filepath);
      return {
        filename,
        filepath,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        sizeFormatted: this.formatFileSize(stats.size)
      };
    } catch (error) {
      console.error('Get export info error:', error);
      return null;
    }
  }

  /**
   * Format file size for display
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Helper methods for generating insights
  getMoodDescription(mood) {
    if (mood >= 4.5) return 'Excellent';
    if (mood >= 3.5) return 'Good';
    if (mood >= 2.5) return 'Fair';
    if (mood >= 1.5) return 'Poor';
    return 'Very Poor';
  }

  getEnergyDescription(energy) {
    if (energy >= 4.5) return 'Very High';
    if (energy >= 3.5) return 'High';
    if (energy >= 2.5) return 'Moderate';
    if (energy >= 1.5) return 'Low';
    return 'Very Low';
  }

  getSentimentDescription(sentiment) {
    if (sentiment >= 0.5) return 'Very Positive';
    if (sentiment >= 0.2) return 'Positive';
    if (sentiment >= -0.2) return 'Neutral';
    if (sentiment >= -0.5) return 'Negative';
    return 'Very Negative';
  }

  assessTeamHealth(teamData) {
    const criticalIssues = [
      teamData.average_mood < 2.0,
      teamData.average_sentiment < -0.5,
      teamData.average_energy < 2.0,
      teamData.participation_rate < 0.3
    ].filter(Boolean).length;

    const warningIssues = [
      teamData.average_mood < 3.0,
      teamData.average_sentiment < -0.2,
      teamData.average_energy < 3.0,
      teamData.participation_rate < 0.6
    ].filter(Boolean).length;

    if (criticalIssues > 0) {
      return {
        status: 'CRITICAL',
        riskLevel: 'HIGH',
        description: 'Team health requires immediate attention. Multiple critical indicators detected.'
      };
    } else if (warningIssues > 1) {
      return {
        status: 'AT RISK',
        riskLevel: 'MEDIUM',
        description: 'Team health shows warning signs. Monitor closely and consider interventions.'
      };
    } else if (teamData.average_mood > 4.0 && teamData.average_sentiment > 0.3) {
      return {
        status: 'EXCELLENT',
        riskLevel: 'LOW',
        description: 'Team health is excellent with high morale and positive sentiment.'
      };
    } else {
      return {
        status: 'GOOD',
        riskLevel: 'LOW',
        description: 'Team health is within normal ranges. Continue regular monitoring.'
      };
    }
  }

  generateRecommendations(teamData, alertStats) {
    const recommendations = [];

    if (teamData.participation_rate < 0.6) {
      recommendations.push('Increase team engagement by encouraging regular check-ins and addressing barriers to participation.');
    }

    if (teamData.average_mood < 3.0) {
      recommendations.push('Schedule one-on-one meetings with team members to address mood concerns and provide support.');
    }

    if (teamData.average_energy < 3.0) {
      recommendations.push('Review workload distribution and consider implementing work-life balance initiatives.');
    }

    if (teamData.average_sentiment < -0.2) {
      recommendations.push('Investigate sources of negative sentiment and implement targeted improvements.');
    }

    if (alertStats && alertStats.by_severity.critical > 0) {
      recommendations.push('Address critical alerts immediately to prevent escalation of team wellness issues.');
    }

    if (recommendations.length === 0) {
      recommendations.push('Continue current practices and maintain regular wellness monitoring.');
      recommendations.push('Consider team building activities to further enhance positive team dynamics.');
    }

    return recommendations;
  }

  analyzeTrends(trendData) {
    if (trendData.length < 2) return 'Insufficient data for trend analysis.';

    const recent = trendData.slice(-7); // Last 7 days
    let moodTrend = 'stable';
    let sentimentTrend = 'stable';

    // Analyze mood trend
    const moodDiff = recent[recent.length - 1].avg_mood - recent[0].avg_mood;
    if (moodDiff > 0.5) moodTrend = 'improving';
    else if (moodDiff < -0.5) moodTrend = 'declining';

    // Analyze sentiment trend
    const sentimentDiff = recent[recent.length - 1].avg_sentiment - recent[0].avg_sentiment;
    if (sentimentDiff > 0.2) sentimentTrend = 'improving';
    else if (sentimentDiff < -0.2) sentimentTrend = 'declining';

    return `Mood trend: ${moodTrend} (${moodDiff > 0 ? '+' : ''}${moodDiff.toFixed(2)}). Sentiment trend: ${sentimentTrend} (${sentimentDiff > 0 ? '+' : ''}${sentimentDiff.toFixed(2)}).`;
  }
}

module.exports = new ExportService();