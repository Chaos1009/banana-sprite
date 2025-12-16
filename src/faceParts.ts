import { FacePartRect, FacePartRectMap, FacePartImages, FacePartKey } from '../types';
import { SpriteSheetAnalysis } from '../services/geminiService';

/**
 * Default face part rectangles (normalized coordinates, will be scaled to frame size)
 * These are relative positions within a frame (0-1 range)
 */
export const DEFAULT_FACE_PARTS: FacePartRectMap = {
  eyesOpen: { x: 0.25, y: 0.2, w: 0.5, h: 0.15 },
  eyesClosed: { x: 0.25, y: 0.2, w: 0.5, h: 0.05 },
  mouthOpen: { x: 0.3, y: 0.5, w: 0.4, h: 0.2 },
  mouthClosed: { x: 0.3, y: 0.55, w: 0.4, h: 0.05 },
};

/**
 * Analyzes mouth region to detect if it's open or closed
 * Returns a score: higher = more open
 * Uses color variance to detect mouth opening (open mouth has more color variation)
 */
const analyzeMouthOpenness = async (
  frameDataUrl: string,
  mouthRect: FacePartRect,
  frameWidth: number,
  frameHeight: number
): Promise<number> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const x = Math.floor(mouthRect.x * frameWidth);
      const y = Math.floor(mouthRect.y * frameHeight);
      const w = Math.floor(mouthRect.w * frameWidth);
      const h = Math.floor(mouthRect.h * frameHeight);
      
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        resolve(0);
        return;
      }
      
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      
      // 口の中央部分を分析（上下20%を除外）
      const centerStartY = Math.floor(h * 0.2);
      const centerEndY = Math.floor(h * 0.8);
      const centerHeight = centerEndY - centerStartY;
      
      // 色の分散度を計算（口が開いていると色の変化が大きい）
      const brightnessValues: number[] = [];
      let nonTransparentPixels = 0;
      
      for (let y = centerStartY; y < centerEndY; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const alpha = data[idx + 3];
          
          if (alpha > 128) { // Not transparent
            // 明度を計算（YUV形式のY成分に近い）
            const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
            brightnessValues.push(brightness);
            nonTransparentPixels++;
          }
        }
      }
      
      if (nonTransparentPixels === 0) {
        resolve(0);
        return;
      }
      
      // 平均明度を計算
      const avgBrightness = brightnessValues.reduce((sum, val) => sum + val, 0) / brightnessValues.length;
      
      // 分散度を計算（標準偏差）
      const variance = brightnessValues.reduce((sum, val) => {
        const diff = val - avgBrightness;
        return sum + diff * diff;
      }, 0) / brightnessValues.length;
      
      const stdDev = Math.sqrt(variance);
      
      // 口が開いている場合、色の分散が大きくなる
      // また、暗いピクセル（口の中）の割合も考慮
      let darkPixels = 0;
      for (const brightness of brightnessValues) {
        if (brightness < 0.3) { // 暗いピクセル（口の中）
          darkPixels++;
        }
      }
      const darkRatio = darkPixels / brightnessValues.length;
      
      // スコア = 分散度 + 暗いピクセルの割合
      // 分散度は0-1の範囲に正規化（経験的に0.3以上で口が開いていると判断）
      const normalizedVariance = Math.min(stdDev * 3, 1); // 分散を0-1に正規化
      const openness = normalizedVariance * 0.7 + darkRatio * 0.3;
      
      resolve(openness);
    };
    img.onerror = () => resolve(0);
    img.src = frameDataUrl;
  });
};

/**
 * Finds the best frames for open and closed mouth/eyes from all frames
 */
export const findBestExpressionFrames = async (
  frames: string[],
  frameWidth: number,
  frameHeight: number
): Promise<{
  eyesOpenFrameIndex: number;
  eyesClosedFrameIndex: number;
  mouthOpenFrameIndex: number;
  mouthClosedFrameIndex: number;
}> => {
  console.log('[findBestExpressionFrames] 最適なフレームを検索開始', {
    frameCount: frames.length,
    frameWidth,
    frameHeight,
  });

  let maxMouthOpen = 0;
  let minMouthOpen = Infinity;
  let mouthOpenIndex = 0;
  let mouthClosedIndex = 0;
  const mouthOpennessScores: number[] = [];
  
  // Analyze all frames to find best open/closed states
  // 口の位置は同じなので、mouthOpenの矩形を使用（位置は同じ、高さだけが異なる可能性がある）
  for (let i = 0; i < frames.length; i++) {
    // 口の領域全体を分析（mouthOpenとmouthClosedの両方の領域を含む）
    const mouthRect = {
      x: Math.min(DEFAULT_FACE_PARTS.mouthOpen.x, DEFAULT_FACE_PARTS.mouthClosed.x),
      y: Math.min(DEFAULT_FACE_PARTS.mouthOpen.y, DEFAULT_FACE_PARTS.mouthClosed.y),
      w: Math.max(
        DEFAULT_FACE_PARTS.mouthOpen.x + DEFAULT_FACE_PARTS.mouthOpen.w,
        DEFAULT_FACE_PARTS.mouthClosed.x + DEFAULT_FACE_PARTS.mouthClosed.w
      ) - Math.min(DEFAULT_FACE_PARTS.mouthOpen.x, DEFAULT_FACE_PARTS.mouthClosed.x),
      h: Math.max(
        DEFAULT_FACE_PARTS.mouthOpen.y + DEFAULT_FACE_PARTS.mouthOpen.h,
        DEFAULT_FACE_PARTS.mouthClosed.y + DEFAULT_FACE_PARTS.mouthClosed.h
      ) - Math.min(DEFAULT_FACE_PARTS.mouthOpen.y, DEFAULT_FACE_PARTS.mouthClosed.y),
    };
    
    const openness = await analyzeMouthOpenness(
      frames[i],
      mouthRect,
      frameWidth,
      frameHeight
    );
    mouthOpennessScores.push(openness);
    
    if (openness > maxMouthOpen) {
      maxMouthOpen = openness;
      mouthOpenIndex = i;
    }
    if (openness < minMouthOpen) {
      minMouthOpen = openness;
      mouthClosedIndex = i;
    }
  }
  
  console.log('[findBestExpressionFrames] 口の分析結果', {
    mouthOpennessScores: mouthOpennessScores.map((score, idx) => ({
      frameIndex: idx,
      score: score.toFixed(4),
    })),
    mouthOpenFrameIndex: mouthOpenIndex,
    mouthClosedFrameIndex: mouthClosedIndex,
    maxMouthOpen: maxMouthOpen.toFixed(4),
    minMouthOpen: minMouthOpen.toFixed(4),
    isSameFrame: mouthOpenIndex === mouthClosedIndex,
  });

  // For eyes, use frame 0 as default (can be improved later)
  // For now, assume frame 0 has eyes open, and we'll create closed eyes by modifying
  const result = {
    eyesOpenFrameIndex: 0,
    eyesClosedFrameIndex: 0, // Will be handled by extracting with different rect
    mouthOpenFrameIndex: mouthOpenIndex,
    mouthClosedFrameIndex: mouthClosedIndex,
  };

  if (mouthOpenIndex === mouthClosedIndex) {
    console.warn('[findBestExpressionFrames] ⚠️ 警告: 口が開いたフレームと閉じたフレームが同じです！', {
      frameIndex: mouthOpenIndex,
      score: maxMouthOpen.toFixed(4),
    });
  }

  return result;
};

/**
 * Extracts face parts from a frame image
 */
export const extractFaceParts = async (
  frameDataUrl: string,
  parts: FacePartRectMap = DEFAULT_FACE_PARTS,
  frameWidth?: number,
  frameHeight?: number
): Promise<FacePartImages> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const width = frameWidth || img.width;
      const height = frameHeight || img.height;
      
      const result: Partial<FacePartImages> = {};
      
      // Extract each face part
      (Object.keys(parts) as FacePartKey[]).forEach((key) => {
        const rect = parts[key];
        const x = Math.floor(rect.x * width);
        const y = Math.floor(rect.y * height);
        const w = Math.floor(rect.w * width);
        const h = Math.floor(rect.h * height);
        
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        // Draw the cropped region
        ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
        result[key] = canvas.toDataURL('image/png');
      });
      
      resolve(result as FacePartImages);
    };
    img.onerror = reject;
    img.src = frameDataUrl;
  });
};

/**
 * Extracts face parts using Gemini API analysis results
 */
export const extractExpressionPartsWithAnalysis = async (
  frames: string[],
  frameWidth: number,
  frameHeight: number,
  analysis: SpriteSheetAnalysis
): Promise<FacePartImages> => {
  console.log('[extractExpressionPartsWithAnalysis] Gemini API分析結果を使用', {
    recommendedEyesOpenFrame: analysis.recommendedEyesOpenFrame,
    recommendedEyesClosedFrame: analysis.recommendedEyesClosedFrame,
    recommendedMouthOpenFrame: analysis.recommendedMouthOpenFrame,
    recommendedMouthClosedFrame: analysis.recommendedMouthClosedFrame,
  });

  // 推奨フレームから顔パーツを抽出
  const eyesOpenFrame = analysis.frames[analysis.recommendedEyesOpenFrame];
  const eyesClosedFrame = analysis.frames[analysis.recommendedEyesClosedFrame];
  const mouthOpenFrame = analysis.frames[analysis.recommendedMouthOpenFrame];
  const mouthClosedFrame = analysis.frames[analysis.recommendedMouthClosedFrame];

  // 分析結果の座標を使用、なければデフォルト値を使用
  const eyesOpenRect = eyesOpenFrame?.eyesRect || DEFAULT_FACE_PARTS.eyesOpen;
  const eyesClosedRect = eyesClosedFrame?.eyesRect || DEFAULT_FACE_PARTS.eyesClosed;
  const mouthOpenRect = mouthOpenFrame?.mouthRect || DEFAULT_FACE_PARTS.mouthOpen;
  const mouthClosedRect = mouthClosedFrame?.mouthRect || DEFAULT_FACE_PARTS.mouthClosed;

  // 各フレームから顔パーツを抽出
  const [eyesOpenData, eyesClosedData, mouthOpenData, mouthClosedData] = await Promise.all([
    extractFaceParts(frames[analysis.recommendedEyesOpenFrame], {
      eyesOpen: eyesOpenRect,
      eyesClosed: eyesOpenRect, // Dummy
      mouthOpen: mouthOpenRect, // Dummy
      mouthClosed: mouthClosedRect, // Dummy
    }, frameWidth, frameHeight),
    extractFaceParts(frames[analysis.recommendedEyesClosedFrame], {
      eyesOpen: eyesOpenRect, // Dummy
      eyesClosed: eyesClosedRect,
      mouthOpen: mouthOpenRect, // Dummy
      mouthClosed: mouthClosedRect, // Dummy
    }, frameWidth, frameHeight),
    extractFaceParts(frames[analysis.recommendedMouthOpenFrame], {
      eyesOpen: eyesOpenRect, // Dummy
      eyesClosed: eyesClosedRect, // Dummy
      mouthOpen: mouthOpenRect,
      mouthClosed: mouthOpenRect, // Dummy
    }, frameWidth, frameHeight),
    extractFaceParts(frames[analysis.recommendedMouthClosedFrame], {
      eyesOpen: eyesOpenRect, // Dummy
      eyesClosed: eyesClosedRect, // Dummy
      mouthOpen: mouthOpenRect, // Dummy
      mouthClosed: mouthClosedRect,
    }, frameWidth, frameHeight),
  ]);

  return {
    eyesOpen: eyesOpenData.eyesOpen,
    eyesClosed: eyesClosedData.eyesClosed,
    mouthOpen: mouthOpenData.mouthOpen,
    mouthClosed: mouthClosedData.mouthClosed,
  };
};

/**
 * Extracts face parts from specific frames (for expression sprites)
 */
export const extractExpressionParts = async (
  frames: string[],
  frameWidth: number,
  frameHeight: number
): Promise<FacePartImages> => {
  console.log('[extractExpressionParts] 顔パーツ抽出開始', {
    frameCount: frames.length,
    frameWidth,
    frameHeight,
  });

  // Find best frames for each expression
  const bestFrames = await findBestExpressionFrames(frames, frameWidth, frameHeight);
  
  console.log('[extractExpressionParts] 使用するフレーム', {
    eyesOpenFrame: bestFrames.eyesOpenFrameIndex,
    eyesClosedFrame: bestFrames.eyesClosedFrameIndex,
    mouthOpenFrame: bestFrames.mouthOpenFrameIndex,
    mouthClosedFrame: bestFrames.mouthClosedFrameIndex,
  });

  // Extract parts from the best frames
  const [eyesOpenData, eyesClosedData, mouthOpenData, mouthClosedData] = await Promise.all([
    extractFaceParts(frames[bestFrames.eyesOpenFrameIndex], {
      eyesOpen: DEFAULT_FACE_PARTS.eyesOpen,
      eyesClosed: DEFAULT_FACE_PARTS.eyesOpen, // Dummy, not used
      mouthOpen: DEFAULT_FACE_PARTS.mouthOpen, // Dummy, not used
      mouthClosed: DEFAULT_FACE_PARTS.mouthClosed, // Dummy, not used
    }, frameWidth, frameHeight),
    extractFaceParts(frames[bestFrames.eyesClosedFrameIndex], {
      eyesOpen: DEFAULT_FACE_PARTS.eyesOpen, // Dummy, not used
      eyesClosed: DEFAULT_FACE_PARTS.eyesClosed,
      mouthOpen: DEFAULT_FACE_PARTS.mouthOpen, // Dummy, not used
      mouthClosed: DEFAULT_FACE_PARTS.mouthClosed, // Dummy, not used
    }, frameWidth, frameHeight),
    extractFaceParts(frames[bestFrames.mouthOpenFrameIndex], {
      eyesOpen: DEFAULT_FACE_PARTS.eyesOpen, // Dummy, not used
      eyesClosed: DEFAULT_FACE_PARTS.eyesClosed, // Dummy, not used
      mouthOpen: DEFAULT_FACE_PARTS.mouthOpen,
      mouthClosed: DEFAULT_FACE_PARTS.mouthOpen, // Dummy, not used
    }, frameWidth, frameHeight),
    extractFaceParts(frames[bestFrames.mouthClosedFrameIndex], {
      eyesOpen: DEFAULT_FACE_PARTS.eyesOpen, // Dummy, not used
      eyesClosed: DEFAULT_FACE_PARTS.eyesClosed, // Dummy, not used
      mouthOpen: DEFAULT_FACE_PARTS.mouthOpen, // Dummy, not used
      mouthClosed: DEFAULT_FACE_PARTS.mouthClosed,
    }, frameWidth, frameHeight),
  ]);
  
  // 抽出された画像のサイズと内容を確認
  const checkImageData = async (dataUrl: string, name: string) => {
    return new Promise<{ width: number; height: number; hasContent: boolean }>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ width: img.width, height: img.height, hasContent: false });
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const data = imageData.data;
        
        // 透明でないピクセルをカウント
        let nonTransparentPixels = 0;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 0) {
            nonTransparentPixels++;
          }
        }
        const hasContent = nonTransparentPixels > 0;
        
        resolve({
          width: img.width,
          height: img.height,
          hasContent,
        });
      };
      img.onerror = () => resolve({ width: 0, height: 0, hasContent: false });
      img.src = dataUrl;
    });
  };

  const [mouthOpenInfo, mouthClosedInfo] = await Promise.all([
    checkImageData(mouthOpenData.mouthOpen, 'mouthOpen'),
    checkImageData(mouthClosedData.mouthClosed, 'mouthClosed'),
  ]);

  console.log('[extractExpressionParts] 抽出された口の画像情報', {
    mouthOpen: {
      ...mouthOpenInfo,
      dataUrlLength: mouthOpenData.mouthOpen.length,
      dataUrlPreview: mouthOpenData.mouthOpen.substring(0, 100) + '...',
    },
    mouthClosed: {
      ...mouthClosedInfo,
      dataUrlLength: mouthClosedData.mouthClosed.length,
      dataUrlPreview: mouthClosedData.mouthClosed.substring(0, 100) + '...',
    },
    areSame: mouthOpenData.mouthOpen === mouthClosedData.mouthClosed,
  });

  if (mouthOpenData.mouthOpen === mouthClosedData.mouthClosed) {
    console.error('[extractExpressionParts] ⚠️ エラー: 口が開いた画像と閉じた画像が同じです！');
  }

  return {
    eyesOpen: eyesOpenData.eyesOpen,
    eyesClosed: eyesClosedData.eyesClosed,
    mouthOpen: mouthOpenData.mouthOpen,
    mouthClosed: mouthClosedData.mouthClosed,
  };
};

/**
 * Draws face part guide rectangles on a canvas (for debugging)
 */
export const drawFaceGuides = (
  ctx: CanvasRenderingContext2D,
  parts: FacePartRectMap,
  scale: number = 1
): void => {
  ctx.strokeStyle = '#FF0000';
  ctx.lineWidth = 2;
  
  (Object.keys(parts) as FacePartKey[]).forEach((key) => {
    const rect = parts[key];
    const x = rect.x * scale;
    const y = rect.y * scale;
    const w = rect.w * scale;
    const h = rect.h * scale;
    
    ctx.strokeRect(x, y, w, h);
    
    // Label
    ctx.fillStyle = '#FF0000';
    ctx.font = '12px monospace';
    ctx.fillText(key, x, y - 5);
  });
};
