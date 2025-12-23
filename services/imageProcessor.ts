import JSZip from 'jszip';
import { UploadedFile, ProcessingConfig, ImageFormat } from '../types';

export const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => reject(err);
    img.src = url;
  });
};

const loadWatermarkImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
};

export const extractImagesFromZip = async (zipFile: File): Promise<File[]> => {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(zipFile);
  const imageFiles: File[] = [];
  const entries = Object.keys(loadedZip.files).filter((filename) => {
    return !loadedZip.files[filename].dir && /\.(jpg|jpeg|png|webp|gif)$/i.test(filename);
  });
  for (const filename of entries) {
    const fileData = await loadedZip.files[filename].async('blob');
    const cleanName = filename.split('/').pop() || filename;
    imageFiles.push(new File([fileData], cleanName, { type: fileData.type }));
  }
  return imageFiles;
};

export const processImage = async (
  file: UploadedFile,
  config: ProcessingConfig
): Promise<Blob> => {
  const img = await loadImage(file.file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  const shouldFillBackground = config.format === ImageFormat.JPG || config.fillBackground;

  if (config.keepOriginalSize) {
    canvas.width = img.width;
    canvas.height = img.height;
    if (shouldFillBackground) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0);
  } else {
    canvas.width = config.width;
    canvas.height = config.height;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (shouldFillBackground) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const srcRatio = img.width / img.height;
    const dstRatio = config.width / config.height;
    let drawWidth, drawHeight, offsetX, offsetY;
    if (srcRatio > dstRatio) {
      drawWidth = config.width;
      drawHeight = img.height * (config.width / img.width);
      offsetX = 0;
      offsetY = (config.height - drawHeight) / 2;
    } else {
      drawHeight = config.height;
      drawWidth = img.width * (config.height / img.height);
      offsetX = (config.width - drawWidth) / 2;
      offsetY = 0;
    }
    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
  }

  if (config.watermarkEnabled && config.watermarkImageUrl) {
    try {
      const wmImg = await loadWatermarkImage(config.watermarkImageUrl);
      ctx.save();
      
      // Apply filters
      if (config.watermarkColorMode === 'grayscale') {
        ctx.filter = 'grayscale(100%)';
      }
      
      ctx.globalAlpha = config.watermarkOpacity;
      const wmAspectRatio = wmImg.width / wmImg.height;
      const targetWmWidth = canvas.width * (config.watermarkScale / 100); 
      const targetWmHeight = targetWmWidth / wmAspectRatio;
      const padding = Math.max(canvas.width, canvas.height) * 0.03;
      const halfW = targetWmWidth / 2;
      const halfH = targetWmHeight / 2;

      const drawWM = (cx: number, cy: number) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((config.watermarkRotation * Math.PI) / 180);
        ctx.drawImage(wmImg, -halfW, -halfH, targetWmWidth, targetWmHeight);
        ctx.restore();
      };

      if (config.watermarkMode === 'tiled') {
        // Correct tiling logic: fill the whole canvas including edges
        // Use a safe spacing that prevents huge overlap but ensures full coverage
        const stepX = targetWmWidth * 1.5;
        const stepY = targetWmHeight * 1.5;
        
        // Loop from negative padding to past canvas boundaries
        for (let x = -stepX; x < canvas.width + stepX; x += stepX) {
          for (let y = -stepY; y < canvas.height + stepY; y += stepY) {
            // Staggered rows for better visual distribution
            const rowOffset = (Math.floor((y + stepY) / stepY) % 2 === 0) ? stepX / 2 : 0;
            drawWM(x + rowOffset, y);
          }
        }
      } else {
        const positions: {x: number, y: number}[] = [];
        if (config.watermarkMode === 'single') {
          let cx, cy;
          if (config.watermarkPosition === 'custom') {
            cx = (config.customX / 100) * canvas.width;
            cy = (config.customY / 100) * canvas.height;
          } else {
            switch (config.watermarkPosition) {
              case 'center': cx = canvas.width / 2; cy = canvas.height / 2; break;
              case 'top-left': cx = padding + halfW; cy = padding + halfH; break;
              case 'top-right': cx = canvas.width - padding - halfW; cy = padding + halfH; break;
              case 'bottom-left': cx = padding + halfW; cy = canvas.height - padding - halfH; break;
              case 'bottom-right': cx = canvas.width - padding - halfW; cy = canvas.height - padding - halfH; break;
              default: cx = canvas.width / 2; cy = canvas.height / 2;
            }
          }
          positions.push({x: cx, y: cy});
        } else if (config.watermarkMode === 'dual') {
          positions.push({x: padding + halfW, y: padding + halfH});
          positions.push({x: canvas.width - padding - halfW, y: canvas.height - padding - halfH});
        } else if (config.watermarkMode === 'triple') {
          positions.push({x: padding + halfW, y: padding + halfH});
          positions.push({x: canvas.width / 2, y: canvas.height / 2});
          positions.push({x: canvas.width - padding - halfW, y: canvas.height - padding - halfH});
        }
        positions.forEach(pos => drawWM(pos.x, pos.y));
      }
      ctx.restore();
    } catch (e) {
      console.warn("Failed to apply watermark", e);
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas to Blob failed'));
      },
      config.format,
      config.quality
    );
  });
};

export const packageZip = async (processedFiles: UploadedFile[], config: ProcessingConfig): Promise<Blob> => {
  const zip = new JSZip();
  const folderName = config.keepOriginalSize ? `converted_original_size` : `converted_${config.width}x${config.height}`;
  const folder = zip.folder(folderName);
  processedFiles.forEach((f) => {
    if (f.status === 'success' && f.processedBlob) {
      const ext = config.format.split('/')[1];
      const baseName = f.originalName.substring(0, f.originalName.lastIndexOf('.')) || f.originalName;
      let fileName = config.keepOriginalSize ? `${baseName}_converted.${ext}` : `${baseName}_${config.width}x${config.height}_converted.${ext}`;
      folder?.file(fileName, f.processedBlob);
    }
  });
  return await zip.generateAsync({ type: 'blob' });
};