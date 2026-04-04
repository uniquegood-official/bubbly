import { generateText, Output } from "ai";
import { z } from "zod";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { title, context } = req.body ?? {};
  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "title is required" });
  }

  try {
    const { output } = await generateText({
      model: "anthropic/claude-sonnet-4.5",
      maxOutputTokens: 1024,
      output: Output.object({
        schema: z.object({
          subtasks: z.array(
            z.object({
              title: z.string(),
              priority: z.number().min(1).max(5),
              estimatedMinutes: z.number().optional(),
            })
          ),
        }),
      }),
      prompt: `You are a task planning assistant. Given a task, break it down into 3-6 actionable subtasks.

Task: "${title}"
${context ? `Context: ${context}` : ""}

Rules:
- Each subtask should be specific and actionable
- Priority 1=trivial, 5=critical — assign based on importance to completing the parent task
- Estimate minutes realistically (5-120 range)
- Keep subtask titles concise (under 30 characters in Korean)
- Respond in Korean`,
    });

    return res.status(200).json(output);
  } catch (error: any) {
    console.error("AI generation error:", error);
    return res.status(500).json({ error: "Failed to generate subtasks" });
  }
}
