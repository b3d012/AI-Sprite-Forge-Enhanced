let defaultModel = 'gpt-image-1';

self.onmessage = async function(e) {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT':
      defaultModel = payload?.model || defaultModel;
      break;

    case 'GENERATE_FRAME':
      try {
        const {
          styleId,
          actionId,
          frameIndex,
          prompt,
          previousFrame,
          referenceImage,
          isReferenceStyle
        } = payload;

        const image = isReferenceStyle ? referenceImage : previousFrame;
        const response = await fetch('/api/pipeline', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            stage: 'animation-frame',
            prompt,
            image,
            options: {
              model: payload?.model || defaultModel,
              backgroundMode: 'transparent',
              outputFormat: 'png'
            },
            filename: `frame-${frameIndex + 1}.png`
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error?.message || `API call failed: ${response.statusText}`);
        }

        self.postMessage({
          type: 'FRAME_COMPLETE',
          payload: {
            frameIndex,
            styleId,
            actionId,
            imageData: data.base64 || data.dataUrl,
            error: null
          }
        });
      } catch (error) {
        self.postMessage({
          type: 'FRAME_ERROR',
          payload: {
            frameIndex,
            styleId,
            actionId,
            error: error.message
          }
        });
      }
      break;
  }
};
