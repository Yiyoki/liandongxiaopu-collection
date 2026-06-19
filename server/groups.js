export const PRODUCT_GROUPS = [
  {
    id: 'gpt_free',
    label: 'GPT Free',
    keywords: [
      'free',
      'gpt free',
      'chatgpt free',
      '白号'
    ]
  },
  {
    id: 'gpt_team',
    label: 'GPT Team',
    keywords: [
      'team',
      'gpt team',
      'chatgpt team',
      'team子号',
      '团队',
      '团队号'
    ]
  },
  {
    id: 'gpt_plus',
    label: 'GPT Plus',
    keywords: [
      'plus',
      'gpt plus',
      'chatgpt plus',
      'plus成品',
      '月卡'
    ]
  },
  {
    id: 'gpt_pro',
    label: 'GPT Pro',
    keywords: [
      'pro',
      'gpt pro',
      'chatgpt pro',
      '2000额度'
    ]
  },
  {
    id: 'claude',
    label: 'Claude',
    keywords: ['claude', 'anthropic', 'opus', 'sonnet', 'haiku', 'kiro']
  },
  {
    id: 'grok',
    label: 'Grok',
    keywords: ['grok', 'supergrok', 'super grok', 'xai', 'x.ai']
  },
  {
    id: 'gemini_google',
    label: 'Gemini / Google',
    keywords: ['gemini', 'google', '谷歌', 'gmail', 'google one', 'ai pro', 'veo']
  },
  {
    id: 'email',
    label: '邮箱',
    keywords: [
      '邮箱',
      'mail',
      'email',
      'outlook',
      'hotmail',
      'gmail',
      '微软邮箱',
      'graph',
      'oauth'
    ]
  },
  {
    id: 'sms',
    label: '接码',
    keywords: ['接码', '验证码', '手机号', '手机', '号码', 'sms', '实体卡', '虚拟卡']
  },
  {
    id: 'other',
    label: '其他',
    keywords: []
  }
];

const GROUP_PRIORITY = ['grok', 'claude', 'gemini_google', 'gpt_free', 'gpt_team', 'gpt_pro', 'gpt_plus', 'sms', 'email'];

export function classifyProduct(product) {
  const category = product.category?.name || product.category || '';
  const primaryText = normalizeText([
    category,
    product.name
  ].filter(Boolean).join(' '));
  const secondaryText = normalizeText(product.description || '');
  const forcedGroup = forcePrimaryGroup(primaryText);

  if (forcedGroup) {
    return {
      groupId: forcedGroup.id,
      groupLabel: forcedGroup.label,
      matchedKeywords: forcedGroup.keywords
    };
  }

  const matches = PRODUCT_GROUPS
    .filter((group) => group.id !== 'other')
    .map((group) => ({
      group,
      matchedKeywords: group.keywords.filter((keyword) => {
        const normalizedKeyword = normalizeText(keyword);
        return primaryText.includes(normalizedKeyword) || secondaryText.includes(normalizedKeyword);
      }),
      score: group.keywords.reduce((total, keyword) => {
        const normalizedKeyword = normalizeText(keyword);
        const primaryHit = primaryText.includes(normalizedKeyword);
        const secondaryHit = secondaryText.includes(normalizedKeyword);
        return total + (primaryHit ? 10 : 0) + (secondaryHit ? secondaryWeight(group.id, normalizedKeyword) : 0);
      }, 0)
    }))
    .filter((entry) => entry.score > 0);

  if (matches.length === 0) {
    return {
      groupId: 'other',
      groupLabel: '其他',
      matchedKeywords: []
    };
  }

  matches.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    const priorityA = GROUP_PRIORITY.indexOf(a.group.id);
    const priorityB = GROUP_PRIORITY.indexOf(b.group.id);
    const normalizedA = priorityA === -1 ? 999 : priorityA;
    const normalizedB = priorityB === -1 ? 999 : priorityB;
    if (normalizedA !== normalizedB) return normalizedA - normalizedB;
    return b.matchedKeywords.length - a.matchedKeywords.length;
  });

  const winner = matches[0];
  return {
    groupId: winner.group.id,
    groupLabel: winner.group.label,
    matchedKeywords: winner.matchedKeywords.slice(0, 5)
  };
}

export function groupOptions() {
  return PRODUCT_GROUPS.map(({ id, label }) => ({ id, label }));
}

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function forcePrimaryGroup(primaryText) {
  const forceRules = [
    { id: 'grok', keywords: ['supergrok', 'super grok', 'grok', 'xai', 'x.ai'] },
    { id: 'claude', keywords: ['claude', 'anthropic', 'opus', 'sonnet', 'kiro'] },
    { id: 'gemini_google', keywords: ['gemini', 'gemin', 'google', '谷歌', 'ai pro'] },
    { id: 'gpt_free', keywords: ['gpt free', 'chatgpt free', 'free账号', 'free号', '白号'] },
    { id: 'gpt_team', keywords: ['gpt team', 'chatgpt team', 'team子号', 'team账号', 'team成品', '团队号'] },
    { id: 'gpt_pro', keywords: ['gpt pro', 'chatgpt pro', 'pro账号', '2000额度'] },
    { id: 'gpt_plus', keywords: ['gpt plus', 'chatgpt plus', 'plus账号', 'plus成品', 'plus月卡'] },
    { id: 'sms', keywords: ['接码', '收码', '验证码', '手机号', '实卡接码', 'sms'] },
    { id: 'email', keywords: ['邮箱', 'outlook', 'hotmail', 'gmail', 'oauth2令牌', 'graph令牌'] }
  ];

  for (const rule of forceRules) {
    const matchedKeywords = rule.keywords.filter((keyword) => primaryText.includes(normalizeText(keyword)));
    if (rule.id === 'gpt_free' && primaryText.includes('gpt') && primaryText.includes('free')) {
      matchedKeywords.push('gpt + free');
    }
    if (matchedKeywords.length > 0) {
      if (rule.id === 'email' && !looksLikeEmailProduct(primaryText)) continue;
      const group = PRODUCT_GROUPS.find((item) => item.id === rule.id);
      return {
        id: group.id,
        label: group.label,
        keywords: matchedKeywords.slice(0, 5)
      };
    }
  }

  return null;
}

function looksLikeEmailProduct(primaryText) {
  const accountContext = ['gpt', 'chatgpt', 'codex', 'claude', 'gemini', 'grok', 'plus', 'pro', 'free', '成品号'];
  const hasEmailUtilityWord = ['outlook', 'hotmail', 'gmail', 'oauth', 'graph', '令牌'].some((word) => primaryText.includes(word));
  const hasAccountContext = accountContext.some((word) => primaryText.includes(word));

  if (hasEmailUtilityWord && !hasAccountContext) return true;
  if (primaryText.includes('微软邮箱')) return true;
  if (primaryText.includes('邮箱') && !hasAccountContext) return true;

  return false;
}

function secondaryWeight(groupId, keyword) {
  const weakSmsWords = ['手机', '手机号', '号码', '验证码', '虚拟卡'];
  const weakEmailWords = ['mail', 'email'];

  if (groupId === 'sms' && weakSmsWords.includes(keyword)) return 1;
  if (groupId === 'email' && weakEmailWords.includes(keyword)) return 1;

  return 3;
}
