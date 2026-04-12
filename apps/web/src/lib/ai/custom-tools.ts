/**
 * Custom tool executors for Managed Agent sessions.
 * When the Agent calls a custom tool, our server executes it and returns results.
 */

interface GenerateImageInput {
  prompt: string;
  size?: "1024x1024" | "1792x1024" | "1024x1792";
  quality?: "standard" | "hd";
}

interface CustomToolResult {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "url"; url: string } }
  >;
  is_error?: boolean;
}

/**
 * Generate an image using OpenAI DALL-E 3 API.
 * Returns the image URL for the Agent to reference.
 */
async function executeGenerateImage(
  input: GenerateImageInput
): Promise<CustomToolResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      content: [{ type: "text", text: "Error: OPENAI_API_KEY not configured." }],
      is_error: true,
    };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: input.prompt,
        n: 1,
        size: input.size || "1024x1024",
        quality: input.quality || "standard",
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[CustomTool:generate_image] OpenAI error:", res.status, errBody);
      return {
        content: [
          { type: "text", text: `Image generation failed (${res.status}): ${errBody}` },
        ],
        is_error: true,
      };
    }

    const data = (await res.json()) as {
      data: Array<{ url: string; revised_prompt?: string }>;
    };

    const imageUrl = data.data[0]?.url;
    if (!imageUrl) {
      return {
        content: [{ type: "text", text: "Image generation returned no results." }],
        is_error: true,
      };
    }

    const revisedPrompt = data.data[0]?.revised_prompt;
    console.log(`[CustomTool:generate_image] Success — URL: ${imageUrl.slice(0, 80)}...`);

    return {
      content: [
        {
          type: "text",
          text: `Image generated successfully.${revisedPrompt ? `\nRevised prompt: ${revisedPrompt}` : ""}\nImage URL: ${imageUrl}`,
        },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CustomTool:generate_image] Error:", msg);
    return {
      content: [{ type: "text", text: `Image generation error: ${msg}` }],
      is_error: true,
    };
  }
}

/**
 * Registry of custom tool executors.
 * Add new tools here as { toolName: executorFunction }.
 */
const CUSTOM_TOOL_EXECUTORS: Record<
  string,
  (input: Record<string, unknown>) => Promise<CustomToolResult>
> = {
  generate_image: (input) =>
    executeGenerateImage(input as unknown as GenerateImageInput),
};

/**
 * Execute a custom tool by name.
 * Returns the result to send back to the Agent session.
 */
export async function executeCustomTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<CustomToolResult> {
  const executor = CUSTOM_TOOL_EXECUTORS[toolName];
  if (!executor) {
    return {
      content: [{ type: "text", text: `Unknown custom tool: ${toolName}` }],
      is_error: true,
    };
  }
  return executor(input);
}
