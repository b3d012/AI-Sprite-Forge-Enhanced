import dotenv from 'dotenv';
import { OpenAIImageProvider } from '../js/pipeline/providers/openaiProvider.js';

dotenv.config();

async function main() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.log('OPENAI_API_KEY not set, skipping optional real OpenAI smoke check.');
    return;
  }

  const provider = new OpenAIImageProvider({
    apiKey: key,
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
  });

  try {
    const result = await provider.generateImage({
      prompt: 'Create a tiny production-style sprite test image with a flat chroma-green background.',
      size: '256x256',
      quality: 'low',
      background: 'opaque',
      stageId: 'openai-smoke-test',
    });

    if (!result?.dataUrl || !result.dataUrl.startsWith('data:image/')) {
      throw new Error('Smoke check did not return an image data URL.');
    }

    console.log('Real OpenAI smoke check passed.');
    console.log(`Stage: ${result.stageId}`);
    console.log(`Data URL length: ${result.dataUrl.length}`);
  } catch (error) {
    console.warn('Real OpenAI smoke check failed (optional):', error.message || error);
    if (process.env.OPENAI_SMOKE_STRICT === '1') {
      process.exitCode = 1;
    }
  }
}

main();
