/**
 * GET /api/wa-bot-config
 * Return user's bot config (or defaults)
 */
const getConfig = async (req, res) => {
  try {
    let config = await req.prisma.waBotConfig.findUnique({
      where: { userId: req.user.id }
    });

    if (!config) {
      config = {
        teamKeywords: [],
        blockedGroups: [],
        alertRules: null,
        enabled: true
      };
    } else {
      config = {
        ...config,
        teamKeywords: JSON.parse(config.teamKeywords || '[]'),
        blockedGroups: JSON.parse(config.blockedGroups || '[]')
      };
    }

    res.json({ config });
  } catch (error) {
    console.error('Error getting bot config:', error);
    res.status(500).json({ error: 'Failed to get config' });
  }
};

/**
 * PUT /api/wa-bot-config
 * Upsert teamKeywords, blockedGroups, enabled
 */
const updateConfig = async (req, res) => {
  try {
    const { teamKeywords, blockedGroups, enabled } = req.body;

    const data = {};
    if (teamKeywords !== undefined) data.teamKeywords = JSON.stringify(teamKeywords);
    if (blockedGroups !== undefined) data.blockedGroups = JSON.stringify(blockedGroups);
    if (enabled !== undefined) data.enabled = enabled;

    const config = await req.prisma.waBotConfig.upsert({
      where: { userId: req.user.id },
      update: data,
      create: {
        userId: req.user.id,
        ...data
      }
    });

    res.json({
      config: {
        ...config,
        teamKeywords: JSON.parse(config.teamKeywords || '[]'),
        blockedGroups: JSON.parse(config.blockedGroups || '[]')
      }
    });
  } catch (error) {
    console.error('Error updating bot config:', error);
    res.status(500).json({ error: 'Failed to update config' });
  }
};

module.exports = { getConfig, updateConfig };
