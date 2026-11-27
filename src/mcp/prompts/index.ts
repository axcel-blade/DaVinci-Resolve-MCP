import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const RULES = `Rules: call resolve_get_status first; never assume a project, timeline, clip or track exists — check with project_get_info / timeline_get_clips / media_list; use item ids from timeline_get_clips; ask the user before any tool that needs confirm: true; if a tool returns status "unsupported", tell the user and use the suggested alternative; report only what the tools confirmed.`;

const PROMPTS: { name: string; title: string; description: string; args: Record<string, z.ZodString | z.ZodOptional<z.ZodString>>; text: (a: Record<string, string | undefined>) => string }[] = [
  {
    name: "create_cinematic_video", title: "Create cinematic video", description: "Full cinematic production from a footage folder.",
    args: { footageFolder: z.string(), title: z.string().optional(), look: z.string().optional() },
    text: (a) => `Create a cinematic video from ${a.footageFolder}. Plan with workflow_create_cinematic_video { dryRun: true }, show the steps, then run it with title "${a.title ?? ""}" and look ${a.look ?? "hollywood_cinematic"}. Render only after I approve.`,
  },
  { name: "create_youtube_video", title: "Create YouTube video", description: "YouTube edit end-to-end.", args: { footageFolder: z.string(), title: z.string().optional(), durationSeconds: z.string().optional() }, text: (a) => `Make a ${a.durationSeconds ?? "60"}-second YouTube video from ${a.footageFolder} titled "${a.title ?? ""}" using workflow_create_youtube_video. First review ai_create_editing_plan output with me.` },
  { name: "create_commercial", title: "Create commercial", description: "Cinematic advertisement.", args: { footageFolder: z.string(), brand: z.string(), tagline: z.string().optional() }, text: (a) => `Create a 30-second commercial for ${a.brand} from ${a.footageFolder} with tagline "${a.tagline ?? ""}" via workflow_create_advertisement.` },
  { name: "create_documentary", title: "Create documentary", description: "Interview-led documentary assembly.", args: { footageFolder: z.string(), title: z.string().optional() }, text: (a) => `Assemble a documentary from ${a.footageFolder} ("${a.title ?? ""}") with workflow_create_documentary; transcribe interviews if a transcription engine is available (check resolve_get_capabilities).` },
  { name: "create_social_media_video", title: "Create social media video", description: "Vertical/square social cut.", args: { footageFolder: z.string(), platform: z.string().optional() }, text: (a) => `Create a ${a.platform ?? "tiktok"} video from ${a.footageFolder} with workflow_create_social_content, big captions, and verify the export.` },
  { name: "apply_cinematic_grading", title: "Apply cinematic grading", description: "Grade the current timeline.", args: { look: z.string().optional() }, text: (a) => `Apply the ${a.look ?? "teal_orange"} look to all clips on V1 of the current timeline with color_apply_look { wholeTrack: true }. Previous grades are kept as versions; tell me how to revert.` },
  { name: "create_fusion_animation", title: "Create Fusion animation", description: "Animated logo/typography in Fusion.", args: { text: z.string(), style: z.string().optional() }, text: (a) => `Create a professional animated ${a.style ?? "logo"} reading "${a.text}": insert a Fusion composition (fusion_insert_composition), build the graph (fusion_create_3d_text or fusion_create_text + fusion_create_background), animate with fusion_create_animation, then list nodes to verify.` },
  { name: "clean_dialogue_audio", title: "Clean dialogue audio", description: "Dialogue cleanup and silence removal.", args: { trackIndex: z.string().optional() }, text: (a) => `Clean the dialogue on audio track ${a.trackIndex ?? "1"}: audio_analyze the source for loudness, audio_dialogue_cleanup, then ai_remove_silence with apply: false and show me the cut list before applying.` },
  { name: "generate_subtitles", title: "Generate subtitles", description: "Captions for the current timeline.", args: { language: z.string().optional() }, text: (a) => `Generate ${a.language ?? "english"} subtitles for the current timeline with subtitle_generate (Resolve engine; fall back to provider if unavailable), then export them with subtitle_export.` },
  { name: "export_professional_master", title: "Export professional master", description: "Master + verification.", args: { outputDir: z.string() }, text: (a) => `Export a professional master of the current timeline to ${a.outputDir} with render_export_timeline { preset: "professional_master" } and report the verified output.` },
];

export function registerPrompts(server: McpServer): void {
  for (const p of PROMPTS) {
    server.registerPrompt(p.name, { title: p.title, description: p.description, argsSchema: p.args }, (args: Record<string, string | undefined>) => ({
      messages: [{ role: "user", content: { type: "text", text: `${p.text(args)}\n\n${RULES}` } }],
    }));
  }
}

export const PROMPT_NAMES = PROMPTS.map((p) => p.name);
