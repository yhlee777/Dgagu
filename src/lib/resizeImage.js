// 업로드한 사진을 캔버스로 리사이즈/압축 — DB·전송 용량을 줄여줘요.
// 글자가 많은 설명/치수도면 이미지는 maxDim/quality를 높여서(예: 1600, 0.92) 화질 저하를 줄이세요.
export function resizeImage(file, maxDim = 1000, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round((height * maxDim) / width); width = maxDim; }
          else { width = Math.round((width * maxDim) / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}