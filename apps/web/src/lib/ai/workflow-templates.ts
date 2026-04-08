import type { WorkflowStep } from "@/lib/types/workflow";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  topicPlaceholder: string;
  steps: Omit<WorkflowStep, "id">[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "xiaohongshu_viral",
    name: "Viral Social Post",
    description: "Search trending news, collect perspectives, write article, generate images, format post",
    topicPlaceholder: "e.g., How AI is replacing white-collar jobs — what skills still matter in 2026",
    steps: [
      {
        order: 1,
        agentId: "general_assistant",
        prompt: "Search today's trending news and hot topics. Pick ONE topic with the highest viral potential — it should be timely, emotional, and debatable. Output: the chosen topic title and a 2-sentence summary of why it's trending.",
      },
      {
        order: 2,
        agentId: "deep_research",
        prompt: "For the given topic, search the web and collect multi-perspective opinions: positive viewpoints, negative viewpoints, and neutral expert analysis. Include at least 3 different perspectives with source context. Output a structured summary.",
      },
      {
        order: 3,
        agentId: "all_around_writer",
        prompt: "Write a compelling social media article based on the research. Style: emotional, concise, with strong hooks. Structure: attention-grabbing opening → key perspectives → surprising insight → call to discussion. Keep it under 800 characters. Add relevant emoji.",
      },
      {
        order: 4,
        agentId: "image_generation",
        prompt: "Generate 4-5 eye-catching images that summarize the article's key points. Each image should work as a standalone visual that conveys one main idea. Think: infographic style, text overlay with key stats, or atmospheric mood images.",
      },
      {
        order: 5,
        agentId: "general_assistant",
        prompt: "Format the final post for social media: combine the article text with image descriptions. Add 5-8 relevant hashtags. Add a discussion-provoking question at the end. Output the complete ready-to-post content.",
      },
    ],
  },
  {
    id: "deep_research_report",
    name: "Deep Research Report",
    description: "Comprehensive web research, data analysis, and PDF report generation",
    topicPlaceholder: "e.g., Claude vs GPT-5 vs Gemini — 2026 large language model landscape deep dive",
    steps: [
      {
        order: 1,
        agentId: "deep_research",
        prompt: "Conduct comprehensive web research on the given topic. Use web search to find at least 10 relevant sources. Collect key facts, statistics, expert opinions, and recent developments. Organize findings into categories. Output a structured research document.",
      },
      {
        order: 2,
        agentId: "data_analysis",
        prompt: "Analyze the research findings. Create comparison tables, identify trends, highlight key data points. Organize the data into sections suitable for a professional report: Executive Summary, Key Findings, Detailed Analysis, and Recommendations.",
      },
      {
        order: 3,
        agentId: "general_assistant",
        prompt: "Using Python code execution, generate a professional PDF report. Include: cover page with title and date, table of contents, executive summary, detailed findings with tables, and recommendations section. Use matplotlib for any charts. Output the downloadable file.",
      },
    ],
  },
  {
    id: "competitor_analysis",
    name: "Competitor Analysis",
    description: "Identify competitors, compare features, generate presentation",
    topicPlaceholder: "e.g., Tesla vs BYD — global EV market leadership battle in 2026",
    steps: [
      {
        order: 1,
        agentId: "market_research_strategist",
        prompt: "Search the web to identify the top 5 competitors for the given product/company. For each competitor, collect: company name, website, founding year, funding status, key products, target market, pricing model, and unique selling points. Output a structured competitor profile for each.",
      },
      {
        order: 2,
        agentId: "data_analysis",
        prompt: "Create a detailed competitive analysis: feature comparison matrix, SWOT analysis for each competitor, market positioning map, pricing comparison table. Identify gaps and opportunities. Output structured analysis with clear formatting.",
      },
      {
        order: 3,
        agentId: "ppt_expert",
        prompt: "Generate a professional presentation summarizing the competitive analysis. Include slides for: overview, competitor profiles (1 slide each), feature comparison matrix, SWOT summary, market positioning, key insights, and strategic recommendations. Use python-pptx to create the .pptx file.",
      },
    ],
  },
];
