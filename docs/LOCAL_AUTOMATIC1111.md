# Local AUTOMATIC1111 Setup

This guide covers the first supported free image backend for AI Sprite Forge Enhanced: a local AUTOMATIC1111 Stable Diffusion WebUI instance.

## What This Backend Does

- Generates images locally on your own machine
- Does not require the OpenAI image API
- Uses the AUTOMATIC1111 WebUI REST API as the image backend
- Lets the app send sprite prompts to a local Stable Diffusion server instead of a paid cloud service
- Uses `/sdapi/v1/txt2img` for prompt-only generations and `/sdapi/v1/img2img` when a reference image is available

This is the recommended free path when you want the app to generate images without OpenAI costs.

## Basic Setup

1. Install AUTOMATIC1111 Stable Diffusion WebUI
   - Follow the official AUTOMATIC1111 installation instructions for your operating system.
   - Make sure you can launch the WebUI successfully before wiring it into this app.

2. Download a Stable Diffusion model
   - You need at least one checkpoint or model file loaded in AUTOMATIC1111.
   - The app can only generate images if AUTOMATIC1111 has a model available.

3. Launch AUTOMATIC1111 with the API enabled
   - Start the WebUI with `--api`
   - Example:
     ```bash
     webui-user.bat --api
     ```
   - Use the equivalent launch method for Linux or macOS if you are not on Windows.

4. Confirm the WebUI is running locally
   - Open `http://127.0.0.1:7860`
   - If that page does not load, the app will not be able to reach the backend

## App Configuration

Set the local Stable Diffusion base URL in the server environment:

- `AUTOMATIC1111_BASE_URL=http://127.0.0.1:7860`

This is the default value used by the app if you do not override it. You can place it in your local `.env` file or update `.env.example` as a reference for your environment.

Also make sure the app is using the local provider:

- `IMAGE_PROVIDER=local`

The browser UI can switch to the local provider, but the actual base URL is still read by the Node server from the environment.

## Recommended Models

- SDXL for general image quality
- Stable Diffusion 1.5 for better compatibility with many pixel-art LoRAs and older checkpoints
- Pixel-art LoRAs and specialty checkpoints can be added later if you want a more stylized look

For sprite work, model choice matters a lot. Better models help, but they still do not guarantee perfect sprite output on the first try.

## First Test Prompt

Use this prompt for a quick smoke test:

> full body character sprite, front-facing, south-facing, centered, neutral upright pose, polished 16-bit JRPG pixel art, crisp chunky pixels, readable silhouette, dark outline clusters, simple shapes, chroma green background

If the backend is configured correctly, you should get a local image result that the app can use in the sprite workflow.

## Troubleshooting

- If generation fails, check that AUTOMATIC1111 is open
- Check that AUTOMATIC1111 was launched with `--api`
- Check that the base URL is correct
- Check that a model is loaded in AUTOMATIC1111
- Check the AUTOMATIC1111 console logs for errors

## Notes

- This is the free local path, not a free cloud API
- OpenAI image API setup is not required for this backend
- Pixel-art quality still depends on the model, prompt, and generation settings
- If you want tighter pixel-art fidelity later, you can add LoRAs or specialized checkpoints on top of this setup
