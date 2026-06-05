import OpenAI from 'openai';

async function main() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.log('OPENAI_API_KEY not set, skipping optional real API check.');
    return;
  }

  const client = new OpenAI({ apiKey: key });
  try {
    const models = await client.models.list();
    console.log(`Real API check passed. Model count: ${models.data?.length ?? 0}`);
  } catch (error) {
    console.error('Real API check failed:', error.message || error);
    process.exitCode = 1;
  }
}

main();

