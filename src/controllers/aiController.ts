import { Request, Response, NextFunction } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../lib/prisma';
import { config } from '../lib/config';

// Defensive JSON parsing utility
const parseClaudeJsonResponse = (rawText: string): any => {
  let cleaned = rawText.trim();
  
  // Remove markdown code fences if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
  }
  
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  
  cleaned = cleaned.trim();
  
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.error('[AI Parser Error] Failed to parse Claude response:', rawText);
    throw new Error('Malformed JSON received from AI assistant');
  }
};

/**
 * Checks if mock fallback is allowed for local development
 */
const shouldFallbackToMock = (): boolean => {
  const isProd = config.NODE_ENV === 'production';
  const hasNoKey = !config.ANTHROPIC_API_KEY || config.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here';
  return !isProd && hasNoKey;
};

/**
 * Recommend next problems
 */
export const recommend = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { problemId } = req.body;
    const userId = req.userId!;

    if (!problemId) {
      return res.status(400).json({ status: 'error', message: 'problemId is required' });
    }

    // 1. Fetch context
    const justSolved = await prisma.problem.findUnique({
      where: { id: problemId },
      include: {
        topics: { select: { topic: true } },
        patterns: { select: { pattern: true } },
      },
    });

    if (!justSolved || justSolved.userId !== userId) {
      return res.status(404).json({ status: 'error', message: 'Just-solved problem not found' });
    }

    const last30Problems = await prisma.problem.findMany({
      where: { userId },
      take: 30,
      orderBy: { dateSolved: 'desc' },
      select: {
        leetcodeNumber: true,
        title: true,
        difficulty: true,
        confidence: true,
      },
    });

    const topicsCounts = await prisma.topic.findMany({
      select: {
        name: true,
        _count: {
          select: {
            problems: { where: { problem: { userId } } },
          },
        },
      },
    });

    const patternsCounts = await prisma.pattern.findMany({
      select: {
        name: true,
        _count: {
          select: {
            problems: { where: { problem: { userId } } },
          },
        },
      },
    });

    // Dev Fallback check
    if (shouldFallbackToMock()) {
      console.warn('[AI] Running in Mock Development Mode. Bypassing Anthropic API call.');
      // Return high-quality mock data matching target patterns
      const targetPatternName = justSolved.patterns[0]?.pattern.name || 'Two Pointer';
      return res.status(200).json({
        status: 'success',
        recommendations: [
          {
            number: justSolved.leetcodeNumber === 1 ? 15 : 11,
            title: justSolved.leetcodeNumber === 1 ? "3Sum" : "Container With Most Water",
            reason: `Directly builds on the '${targetPatternName}' technique used in your solved problem, adding complexity with multiple pointers.`
          },
          {
            number: 424,
            title: "Longest Repeating Character Replacement",
            reason: `Expands your understanding of linear scans by introducing sliding window bounds.`
          },
          {
            number: 3,
            title: "Longest Substring Without Repeating Characters",
            reason: `A classic interview question testing substring search with hash maps.`
          }
        ],
        overallReason: `You solved '${justSolved.title}' successfully. These selections reinforce '${targetPatternName}' patterns while introducing sliding window mechanics.`
      });
    }

    if (!config.ANTHROPIC_API_KEY) {
      return res.status(500).json({ status: 'error', message: 'Anthropic API key is unconfigured' });
    }

    // Initialize Anthropic SDK
    const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

    const systemPrompt = `You are a DSA practice recommendation assistant.
Your task is to recommend 3-5 real, verifiable LeetCode problems (with correct numbers and titles) that build on the pattern of the problem the user just solved.
Do not recommend problems that are already in the user's solved history.
Use your web search tool to find and verify the correct LeetCode problem numbers and titles.

You must return your response in strict JSON format:
{
  "recommendations": [
    {
      "number": 15,
      "title": "3Sum",
      "reason": "Short reason why this builds on the pattern"
    }
  ],
  "overallReason": "Overall summary reasoning for these selections"
}
Respond ONLY with this JSON. No extra commentary.`;

    const userPrompt = `Just Solved Problem:
- LeetCode Number: ${justSolved.leetcodeNumber}
- Title: ${justSolved.title}
- Difficulty: ${justSolved.difficulty}
- Confidence: ${justSolved.confidence}/5
- Topics: ${justSolved.topics.map((t) => t.topic.name).join(', ')}
- Patterns: ${justSolved.patterns.map((p) => p.pattern.name).join(', ')}

User Problem History (Last 30 Solved):
${last30Problems.map((p) => `#${p.leetcodeNumber} - ${p.title} (${p.difficulty}, Confidence: ${p.confidence})`).join('\n')}

User Topic Solved Counts:
${topicsCounts.map((t) => `${t.name}: ${t._count.problems} solved`).join('\n')}

User Pattern Solved Counts:
${patternsCounts.map((p) => `${p.name}: ${p._count.problems} solved`).join('\n')}`;

    try {
      const response = await anthropic.messages.create({
        model: config.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [
          {
            type: 'web_search_20250305',
          },
        ],
      });

      // Extract text content from the multi-block response
      const textBlock = response.content.find((block) => block.type === 'text') as any;
      if (!textBlock || !textBlock.text) {
        throw new Error('Claude returned an empty response or did not output text');
      }

      const payload = parseClaudeJsonResponse(textBlock.text);
      
      // Basic schema validations
      if (!payload.recommendations || !Array.isArray(payload.recommendations) || !payload.overallReason) {
        throw new Error('JSON response structure missing required attributes');
      }

      return res.status(200).json({
        status: 'success',
        ...payload,
      });
    } catch (apiError: any) {
      console.error('[AI Recommendation API Error]:', apiError);
      return res.status(502).json({
        status: 'error',
        message: 'Anthropic AI service encountered an error while processing recommendation',
        details: apiError.message,
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Perform weakness and strength analysis
 */
export const analyzeWeakness = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;

    const topicsCounts = await prisma.topic.findMany({
      select: {
        name: true,
        _count: {
          select: {
            problems: { where: { problem: { userId } } },
          },
        },
      },
    });

    const patternsCounts = await prisma.pattern.findMany({
      select: {
        name: true,
        _count: {
          select: {
            problems: { where: { problem: { userId } } },
          },
        },
      },
    });

    if (shouldFallbackToMock()) {
      console.warn('[AI] Running in Mock Development Mode. Bypassing Anthropic API call.');
      return res.status(200).json({
        status: 'success',
        strengths: ['Array & Hashing (1 problem logged)', 'Two Pointer pattern representation'],
        weakAreas: ['DP (0 problems solved)', 'Linked List (0 problems solved)', 'Backtracking (0 problems solved)'],
        recommendation: 'Your foundations in basic Array iteration are starting to form. You should branch out to Linked Lists, and implement standard Two-Pointer patterns like cycle detection.',
      });
    }

    if (!config.ANTHROPIC_API_KEY) {
      return res.status(500).json({ status: 'error', message: 'Anthropic API key is unconfigured' });
    }

    const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

    const systemPrompt = `You are a DSA performance analysis assistant.
Analyze the user's solved counts across topics and patterns to identify their strengths and weak areas.
Provide a one-paragraph general recommendation.

You must return your response in strict JSON format:
{
  "strengths": ["Topic or Pattern Name: brief description"],
  "weakAreas": ["Topic or Pattern Name: brief description"],
  "recommendation": "One-paragraph actionable advice"
}
Respond ONLY with this JSON. No extra commentary.`;

    const userPrompt = `User Topic Solved Counts:
${topicsCounts.map((t) => `${t.name}: ${t._count.problems} solved`).join('\n')}

User Pattern Solved Counts:
${patternsCounts.map((p) => `${p.name}: ${p._count.problems} solved`).join('\n')}`;

    try {
      const response = await anthropic.messages.create({
        model: config.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const textBlock = response.content.find((block) => block.type === 'text') as any;
      if (!textBlock || !textBlock.text) {
        throw new Error('Claude returned an empty response');
      }

      const payload = parseClaudeJsonResponse(textBlock.text);

      if (!payload.strengths || !payload.weakAreas || !payload.recommendation) {
        throw new Error('JSON response structure missing required attributes');
      }

      return res.status(200).json({
        status: 'success',
        ...payload,
      });
    } catch (apiError: any) {
      console.error('[AI Weakness Analysis Error]:', apiError);
      return res.status(502).json({
        status: 'error',
        message: 'Anthropic AI service encountered an error during weakness analysis',
        details: apiError.message,
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Generate study plan
 */
export const generateStudyPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { minutesAvailable } = req.body;
    const userId = req.userId!;

    if (minutesAvailable === undefined || typeof minutesAvailable !== 'number' || minutesAvailable <= 0) {
      return res.status(400).json({ status: 'error', message: 'A valid positive minutesAvailable is required' });
    }

    const dueRevisions = await prisma.revision.findMany({
      where: {
        completed: false,
        scheduledFor: { lte: new Date() },
        problem: { userId },
      },
      include: {
        problem: {
          select: {
            leetcodeNumber: true,
            title: true,
            difficulty: true,
          },
        },
      },
    });

    const topicsCounts = await prisma.topic.findMany({
      select: {
        name: true,
        _count: {
          select: {
            problems: { where: { problem: { userId } } },
          },
        },
      },
    });

    const patternsCounts = await prisma.pattern.findMany({
      select: {
        name: true,
        _count: {
          select: {
            problems: { where: { problem: { userId } } },
          },
        },
      },
    });

    if (shouldFallbackToMock()) {
      console.warn('[AI] Running in Mock Development Mode. Bypassing Anthropic API call.');
      const tasks = [];
      let elapsed = 0;
      
      // If we have revisions, schedule them first
      if (dueRevisions.length > 0) {
        const rev = dueRevisions[0];
        const time = Math.min(20, minutesAvailable - elapsed);
        tasks.push({
          type: 'REVISION',
          description: `Review scheduled problem #${rev.problem.leetcodeNumber} - ${rev.problem.title}`,
          estMinutes: time
        });
        elapsed += time;
      }
      
      if (elapsed < minutesAvailable) {
        const remaining = minutesAvailable - elapsed;
        tasks.push({
          type: 'PRACTICE',
          description: `Focus on your weak area: Practicing a medium-difficulty problem in 'DP' or 'Trees' topics.`,
          estMinutes: remaining
        });
        elapsed += remaining;
      }

      return res.status(200).json({
        status: 'success',
        tasks,
        totalMinutes: elapsed
      });
    }

    if (!config.ANTHROPIC_API_KEY) {
      return res.status(500).json({ status: 'error', message: 'Anthropic API key is unconfigured' });
    }

    const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

    const systemPrompt = `You are a DSA study planning assistant.
Given the user's available time, their due revisions queue, and their solved history counts (to understand their weak areas), construct a customized study plan.
Focus on reviewing due revisions first, then practice weak patterns if time permits.

You must return your response in strict JSON format:
{
  "tasks": [
    {
      "type": "REVISION" | "PRACTICE" | "BREAK",
      "description": "Brief description of the task",
      "estMinutes": 15
    }
  ],
  "totalMinutes": 45
}
Ensure the sum of estMinutes matches or fits within the user's available time.
Respond ONLY with this JSON. No extra commentary.`;

    const userPrompt = `Available Time: ${minutesAvailable} minutes.

Due Revisions Queue:
${dueRevisions.length === 0 ? 'No due revisions today.' : dueRevisions.map((r) => `#${r.problem.leetcodeNumber} - ${r.problem.title} (${r.problem.difficulty}, interval: ${r.intervalDays} days)`).join('\n')}

User Solved History Counts (Topics/Patterns):
Topics:
${topicsCounts.map((t) => `${t.name}: ${t._count.problems} solved`).join('\n')}
Patterns:
${patternsCounts.map((p) => `${p.name}: ${p._count.problems} solved`).join('\n')}`;

    try {
      const response = await anthropic.messages.create({
        model: config.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const textBlock = response.content.find((block) => block.type === 'text') as any;
      if (!textBlock || !textBlock.text) {
        throw new Error('Claude returned an empty response');
      }

      const payload = parseClaudeJsonResponse(textBlock.text);

      if (!payload.tasks || !Array.isArray(payload.tasks) || payload.totalMinutes === undefined) {
        throw new Error('JSON response structure missing required attributes');
      }

      return res.status(200).json({
        status: 'success',
        ...payload,
      });
    } catch (apiError: any) {
      console.error('[AI Study Plan Error]:', apiError);
      return res.status(502).json({
        status: 'error',
        message: 'Anthropic AI service encountered an error during study plan generation',
        details: apiError.message,
      });
    }
  } catch (error) {
    next(error);
  }
};
