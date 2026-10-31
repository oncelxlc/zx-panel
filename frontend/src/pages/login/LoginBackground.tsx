import { useEffect, useState } from "react";
import { useThemeMode } from "@/theme/themeContext";

/** 解码完成后才替换装饰背景；保留上一张作为淡入底图，快速换主题时丢弃过期结果。 */
export function LoginBackground() {
  const { resolvedMode } = useThemeMode();
  const [images, setImages] = useState({ current: "", previous: "" });
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    const src = resolvedMode === "light"
      ? "/login/login-bg-light.png"
      : "/login/login-bg-dart.png";
    /** 图片失败时保留底色或已加载背景，装饰资源不阻止表单使用。 */
    async function reveal() {
      try {
        await image.decode?.();
        if (!cancelled) {
          setImages((previous) => previous.current === src
            ? previous
            : { current: src, previous: previous.current });
        }
      } catch {
        // 解码失败不能把半张图片交给视觉层。
      }
    }
    image.onload = () => void reveal();
    image.src = src;
    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [resolvedMode]);
  return (
    <div className="login-page__background" aria-hidden="true">
      {images.previous && <img key={images.previous} src={images.previous} alt="" />}
      {images.current && <img key={images.current} className="login-page__image" src={images.current} alt="" />}
    </div>
  );
}
