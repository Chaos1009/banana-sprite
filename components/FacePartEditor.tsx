import React, { useRef, useState, useEffect, useCallback } from 'react';
import { FacePartRect, FacePartRectMap } from '../types';

interface FacePartEditorProps {
  imageUrl: string;
  width: number;
  height: number;
  initialRects: FacePartRectMap;
  onRectsChange: (rects: FacePartRectMap) => void;
  language: 'ja' | 'en';
}

interface DraggingState {
  part: 'eyesOpen' | 'eyesClosed' | 'mouthOpen' | 'mouthClosed' | null;
  handle: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null;
  startX: number;
  startY: number;
  startRect: FacePartRect;
}

export const FacePartEditor: React.FC<FacePartEditorProps> = ({
  imageUrl,
  width,
  height,
  initialRects,
  onRectsChange,
  language,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<FacePartRectMap>(initialRects);
  const [selectedPart, setSelectedPart] = useState<keyof FacePartRectMap | null>(null);
  const [dragging, setDragging] = useState<DraggingState | null>(null);
  const [showPart, setShowPart] = useState<{
    eyes: 'open' | 'closed';
    mouth: 'open' | 'closed';
  }>({ eyes: 'open', mouth: 'open' });

  // 正規化座標をピクセル座標に変換
  const normToPixel = useCallback((normX: number, normY: number) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const scale = Math.min(rect.width / width, rect.height / height);
    const offsetX = (rect.width - width * scale) / 2;
    const offsetY = (rect.height - height * scale) / 2;
    return {
      x: normX * width * scale + offsetX,
      y: normY * height * scale + offsetY,
    };
  }, [width, height]);

  // ピクセル座標を正規化座標に変換
  const pixelToNorm = useCallback((pixelX: number, pixelY: number) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const scale = Math.min(rect.width / width, rect.height / height);
    const offsetX = (rect.width - width * scale) / 2;
    const offsetY = (rect.height - height * scale) / 2;
    return {
      x: (pixelX - offsetX) / (width * scale),
      y: (pixelY - offsetY) / (height * scale),
    };
  }, [width, height]);

  // 矩形を描画
  const drawRect = useCallback((ctx: CanvasRenderingContext2D, rect: FacePartRect, color: string, isSelected: boolean) => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const img = container.querySelector('img');
    if (!img) return;
    
    const imgRect = img.getBoundingClientRect();
    const scaleX = imgRect.width / width;
    const scaleY = imgRect.height / height;
    const offsetX = imgRect.left - containerRect.left;
    const offsetY = imgRect.top - containerRect.top;

    const x = rect.x * width * scaleX + offsetX;
    const y = rect.y * height * scaleY + offsetY;
    const w = rect.w * width * scaleX;
    const h = rect.h * height * scaleY;

    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.setLineDash(isSelected ? [] : [5, 5]);
    ctx.strokeRect(x, y, w, h);

    // 選択されている場合はハンドルを描画
    if (isSelected) {
      const handleSize = 8;
      const handles = [
        { x: x, y: y }, // nw
        { x: x + w / 2, y: y }, // n
        { x: x + w, y: y }, // ne
        { x: x + w, y: y + h / 2 }, // e
        { x: x + w, y: y + h }, // se
        { x: x + w / 2, y: y + h }, // s
        { x: x, y: y + h }, // sw
        { x: x, y: y + h / 2 }, // w
      ];

      ctx.fillStyle = color;
      ctx.setLineDash([]);
      handles.forEach((handle) => {
        ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
        ctx.strokeStyle = '#FFFFFF';
        ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
        ctx.strokeStyle = color;
      });
    }
  }, [width, height]);

  // キャンバスを再描画
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    canvas.width = containerRect.width;
    canvas.height = containerRect.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 矩形を描画
    const eyesKey = showPart.eyes === 'open' ? 'eyesOpen' : 'eyesClosed';
    const mouthKey = showPart.mouth === 'open' ? 'mouthOpen' : 'mouthClosed';

    drawRect(ctx, rects[eyesKey], '#00FF00', selectedPart === eyesKey);
    drawRect(ctx, rects[mouthKey], '#FF0000', selectedPart === mouthKey);
  }, [rects, selectedPart, showPart, drawRect]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // マウス位置からハンドルを判定
  const getHandleAt = useCallback((x: number, y: number, rect: FacePartRect): DraggingState['handle'] => {
    const container = containerRef.current;
    if (!container) return null;
    const img = container.querySelector('img');
    if (!img) return null;
    
    const imgRect = img.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const scaleX = imgRect.width / width;
    const scaleY = imgRect.height / height;
    const offsetX = imgRect.left - containerRect.left;
    const offsetY = imgRect.top - containerRect.top;

    const rectX = rect.x * width * scaleX + offsetX;
    const rectY = rect.y * height * scaleY + offsetY;
    const rectW = rect.w * width * scaleX;
    const rectH = rect.h * height * scaleY;

    const handleSize = 12;
    const handles: Array<{ pos: [number, number], type: DraggingState['handle'] }> = [
      { pos: [rectX, rectY], type: 'nw' },
      { pos: [rectX + rectW / 2, rectY], type: 'n' },
      { pos: [rectX + rectW, rectY], type: 'ne' },
      { pos: [rectX + rectW, rectY + rectH / 2], type: 'e' },
      { pos: [rectX + rectW, rectY + rectH], type: 'se' },
      { pos: [rectX + rectW / 2, rectY + rectH], type: 's' },
      { pos: [rectX, rectY + rectH], type: 'sw' },
      { pos: [rectX, rectY + rectH / 2], type: 'w' },
    ];

    for (const handle of handles) {
      const dx = x - handle.pos[0];
      const dy = y - handle.pos[1];
      if (Math.abs(dx) < handleSize && Math.abs(dy) < handleSize) {
        return handle.type;
      }
    }

    // 矩形内なら移動
    if (x >= rectX && x <= rectX + rectW && y >= rectY && y <= rectY + rectH) {
      return 'move';
    }

    return null;
  }, [width, height]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // どの矩形がクリックされたか確認
    const eyesKey = showPart.eyes === 'open' ? 'eyesOpen' : 'eyesClosed';
    const mouthKey = showPart.mouth === 'open' ? 'mouthOpen' : 'mouthClosed';

    const eyesHandle = getHandleAt(x, y, rects[eyesKey]);
    const mouthHandle = getHandleAt(x, y, rects[mouthKey]);

    if (eyesHandle) {
      setSelectedPart(eyesKey);
      setDragging({
        part: eyesKey,
        handle: eyesHandle,
        startX: x,
        startY: y,
        startRect: { ...rects[eyesKey] },
      });
    } else if (mouthHandle) {
      setSelectedPart(mouthKey);
      setDragging({
        part: mouthKey,
        handle: mouthHandle,
        startX: x,
        startY: y,
        startRect: { ...rects[mouthKey] },
      });
    } else {
      setSelectedPart(null);
    }
  }, [rects, showPart, getHandleAt]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;

    const container = containerRef.current;
    if (!container) return;
    const img = container.querySelector('img');
    if (!img) return;
    
    const imgRect = img.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const scaleX = imgRect.width / width;
    const scaleY = imgRect.height / height;
    
    const x = e.clientX - containerRect.left;
    const y = e.clientY - containerRect.top;

    const dx = (x - dragging.startX) / (width * scaleX);
    const dy = (y - dragging.startY) / (height * scaleY);

    const currentRect = { ...dragging.startRect };
    const handle = dragging.handle;

    if (handle === 'move') {
      currentRect.x = Math.max(0, Math.min(1 - currentRect.w, currentRect.x + dx));
      currentRect.y = Math.max(0, Math.min(1 - currentRect.h, currentRect.y + dy));
    } else {
      // リサイズ
      if (handle === 'nw' || handle === 'n' || handle === 'w') {
        const newW = currentRect.w - dx;
        const newH = handle === 'nw' || handle === 'n' ? currentRect.h - dy : currentRect.h;
        if (newW > 0.01 && newH > 0.01) {
          if (handle === 'nw' || handle === 'w') currentRect.x = Math.max(0, currentRect.x + dx);
          if (handle === 'nw' || handle === 'n') currentRect.y = Math.max(0, currentRect.y + dy);
          currentRect.w = newW;
          if (handle === 'nw' || handle === 'n') currentRect.h = newH;
        }
      }
      if (handle === 'ne' || handle === 'n' || handle === 'e') {
        const newW = handle === 'ne' || handle === 'e' ? currentRect.w + dx : currentRect.w;
        const newH = handle === 'ne' || handle === 'n' ? currentRect.h - dy : currentRect.h;
        if (newW > 0.01 && newH > 0.01) {
          if (handle === 'ne' || handle === 'n') currentRect.y = Math.max(0, currentRect.y + dy);
          currentRect.w = newW;
          if (handle === 'ne' || handle === 'n') currentRect.h = newH;
        }
      }
      if (handle === 'sw' || handle === 's' || handle === 'w') {
        const newW = handle === 'sw' || handle === 'w' ? currentRect.w - dx : currentRect.w;
        const newH = handle === 'sw' || handle === 's' ? currentRect.h + dy : currentRect.h;
        if (newW > 0.01 && newH > 0.01) {
          if (handle === 'sw' || handle === 'w') currentRect.x = Math.max(0, currentRect.x + dx);
          currentRect.w = newW;
          currentRect.h = newH;
        }
      }
      if (handle === 'se' || handle === 's' || handle === 'e') {
        const newW = handle === 'se' || handle === 'e' ? currentRect.w + dx : currentRect.w;
        const newH = handle === 'se' || handle === 's' ? currentRect.h + dy : currentRect.h;
        if (newW > 0.01 && newH > 0.01 && currentRect.x + newW <= 1 && currentRect.y + newH <= 1) {
          currentRect.w = newW;
          currentRect.h = newH;
        }
      }
    }

    const newRects = { ...rects };
    newRects[dragging.part!] = currentRect;
    setRects(newRects);
    onRectsChange(newRects);
  }, [dragging, width, height, rects, onRectsChange]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            {language === 'ja' ? '目の状態' : 'Eyes'}
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setShowPart({ ...showPart, eyes: 'open' })}
              className={`px-3 py-1 text-xs rounded ${
                showPart.eyes === 'open' ? 'bg-yellow-400 text-gray-900' : 'bg-gray-200 text-gray-700'
              }`}
            >
              {language === 'ja' ? '開' : 'Open'}
            </button>
            <button
              onClick={() => setShowPart({ ...showPart, eyes: 'closed' })}
              className={`px-3 py-1 text-xs rounded ${
                showPart.eyes === 'closed' ? 'bg-yellow-400 text-gray-900' : 'bg-gray-200 text-gray-700'
              }`}
            >
              {language === 'ja' ? '閉' : 'Closed'}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            {language === 'ja' ? '口の状態' : 'Mouth'}
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setShowPart({ ...showPart, mouth: 'open' })}
              className={`px-3 py-1 text-xs rounded ${
                showPart.mouth === 'open' ? 'bg-yellow-400 text-gray-900' : 'bg-gray-200 text-gray-700'
              }`}
            >
              {language === 'ja' ? '開' : 'Open'}
            </button>
            <button
              onClick={() => setShowPart({ ...showPart, mouth: 'closed' })}
              className={`px-3 py-1 text-xs rounded ${
                showPart.mouth === 'closed' ? 'bg-yellow-400 text-gray-900' : 'bg-gray-200 text-gray-700'
              }`}
            >
              {language === 'ja' ? '閉' : 'Closed'}
            </button>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative border-2 border-gray-300 rounded-lg bg-white select-none"
        style={{ aspectRatio: `${width}/${height}`, maxWidth: '100%' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDragStart={(e) => e.preventDefault()}
        onDrag={(e) => e.preventDefault()}
        onDragEnd={(e) => e.preventDefault()}
      >
        <img
          src={imageUrl}
          alt="Sprite frame"
          className="w-full h-full object-contain pointer-events-none select-none"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
          style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>

      <div className="text-xs text-gray-600">
        <p>{language === 'ja' ? '💡 緑の矩形: 目、赤の矩形: 口' : '💡 Green: Eyes, Red: Mouth'}</p>
        <p>{language === 'ja' ? 'ドラッグで移動、角や辺をドラッグでサイズ変更' : 'Drag to move, drag corners/edges to resize'}</p>
      </div>
    </div>
  );
};

