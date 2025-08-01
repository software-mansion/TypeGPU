let processor: MediaStreamTrackProcessor<VideoFrame> | undefined;
let reader: ReadableStreamDefaultReader<VideoFrame> | undefined;
let isRunning = false;

self.onmessage = async (event) => {
  const { type, track } = event.data;

  if (type === 'init') {
    await initProcessor(track);
  } else if (type === 'cleanup') {
    cleanup();
  }
};

async function initProcessor(track: MediaStreamVideoTrack) {
  try {
    cleanup();

    processor = new MediaStreamTrackProcessor({ track });
    reader = processor.readable.getReader();
    isRunning = true;

    processFrames();
  } catch (error) {
    console.error('Failed to initialize video processor:', error);
  }
}

async function processFrames() {
  if (!reader || !isRunning) return;

  try {
    while (isRunning) {
      const { done, value } = await reader.read();

      if (done || !isRunning) break;

      self.postMessage({ type: 'frame', frame: value });
    }
  } catch (error) {
    if (isRunning) {
      console.error('Error processing video frames:', error);
    }
  }
}

function cleanup() {
  isRunning = false;

  if (reader) {
    try {
      reader.releaseLock();
    } catch (error) {
      console.error('Error releasing reader lock:', error);
    }
    reader = undefined;
  }

  processor = undefined;
}
